require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');


const app = express();


// ==================== FILE UPLOAD CONFIG ====================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'nrsc-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    }
});

// ==================== SECURITY CONFIGURATION ====================
app.use(helmet());
app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
}));

// ==================== CORS CONFIGURATION ====================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.disable('x-powered-by');

// ==================== DATABASE CONNECTION ====================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: 'nrsc_chat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==================== JWT CONFIGURATION ====================
const JWT_SECRET = process.env.JWT_SECRET || 'nrsc_secure_default_key';
const TOKEN_EXPIRY = '1h';

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.authToken || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication token missing' 
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify session exists in database and isn't expired
    const [sessions] = await pool.execute(
      'SELECT * FROM active_sessions WHERE user_id = ? AND session_token = ? AND expires_at > NOW()',
      [decoded.id, token]
    );

    if (sessions.length === 0) {
      // Clear invalid cookie
      res.clearCookie('authToken');
      return res.status(403).json({ 
        success: false,
        message: 'Session expired or invalid' 
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.clearCookie('authToken');
    res.status(403).json({ 
      success: false,
      message: 'Invalid or expired token' 
    });
  }
};

// ==================== ROLE-BASED ACCESS MIDDLEWARE ====================
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (req.user.role !== requiredRole) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient privileges'
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during role verification'
      });
    }
  };
};


// ==================== LOGIN ENDPOINT ====================
app.post('/api/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const [users] = await pool.execute(
      'SELECT id, email, password_hash, role FROM users WHERE email = ? AND is_active = 1',
      [req.body.email]
    );

    if (users.length === 0 || !await bcrypt.compare(req.body.password, users[0].password_hash)) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    const user = users[0];
    
    // Delete existing sessions for this user
    await pool.execute(
      'DELETE FROM active_sessions WHERE user_id = ?',
      [user.id]
    );

    const token = jwt.sign(
      { 
        id: user.id,
        role: user.role,
        iss: 'nrsc-auth-server'
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Store new session in database
    await pool.execute(
      `INSERT INTO active_sessions 
      (user_id, session_token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)`,
      [
        user.id,
        token,
        req.ip,
        req.headers['user-agent'],
        new Date(Date.now() + 3600000)
      ]
    );

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
      path: '/'
    }).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// ==================== LOGOUT ENDPOINT ====================
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    // Delete current session from database
    await pool.execute(
      'DELETE FROM active_sessions WHERE session_token = ?',
      [req.cookies.authToken]
    );

    // Clear authentication cookie
    res.clearCookie('authToken', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    }).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// ==================== PROTECTED ENDPOINTS ====================

// ==================== ADMIN DATA ENDPOINT ====================
app.get('/api/admin-data', authenticateToken, async (req, res) => {
  try {
      const [user] = await pool.execute(
          'SELECT id, email, role FROM users WHERE id = ?',
          [req.user.id]
      );

      if (user.length === 0) {
          return res.status(404).json({
              success: false,
              message: 'User not found'
          });
      }

      res.json({
          success: true,
          user: {
              id: user[0].id,
              email: user[0].email,
              role: user[0].role
          }
      });
  } catch (error) {
      console.error('Admin data error:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to fetch admin data'
      });
  }
});

// ==================== ACTIVE SESSIONS ENDPOINT ====================
app.get('/api/active-sessions', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
    const [results] = await pool.execute(
      `SELECT 
        asess.id, 
        u.email, 
        asess.ip_address, 
        asess.user_agent, 
        asess.created_at,
        asess.expires_at
       FROM active_sessions asess
       JOIN users u ON asess.user_id = u.id
       WHERE asess.expires_at > NOW()`
    );
    
    res.json({
      success: true,
      count: results.length,
      sessions: results.map(session => ({
        id: session.id,
        email: session.email,
        ip: session.ip_address,
        device: session.user_agent,
        loginTime: session.created_at,
        expiresAt: session.expires_at
      }))
    });
  } catch (error) {
    console.error('Active sessions error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve active sessions' 
    });
  }
});

// Pending Requests Endpoint
app.get('/api/pending-requests', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
    const [requests] = await pool.execute(
      `SELECT ar.id, u.email, ar.requested_role, ar.created_at
       FROM admin_requests ar
       JOIN users u ON ar.requester_id = u.id
       WHERE ar.status = 'pending'`
    );

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r.id,
        name: r.email,
        type: r.requested_role,
        date: r.created_at
      }))
    });
  } catch (error) {
    console.error('Pending requests error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve pending requests' 
    });
  }
});

// ==================== KNOWLEDGE REQUEST ENDPOINTS ====================

// Submit knowledge request
app.post('/api/knowledge-requests', 
  authenticateToken,
  requireRole('admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      // Manual validation since we're using file upload
      const { title, type, description } = req.body;
      const errors = [];

      if (!title || title.length < 5 || title.length > 255) {
        errors.push({
          param: 'title',
          msg: 'Title must be 5-255 characters'
        });
      }

      if (!['text', 'link', 'pdf'].includes(type)) {
        errors.push({
          param: 'type',
          msg: 'Invalid content type'
        });
      }

      if (description && description.length > 500) {
        errors.push({
          param: 'description',
          msg: 'Description too long (max 500 chars)'
        });
      }

      if (errors.length > 0) {
        return res.status(400).json({ 
          success: false,
          errors
        });
      }

      let content = '';
      let filePath = '';
      
      // Handle PDF upload
      if (type === 'pdf') {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            message: 'PDF file is required'
          });
        }
        filePath = req.file.path;
        content = `PDF:${req.file.filename}`;
      } 
      // Handle text/link content
      else {
        content = req.body.content || '';
        
        if (!content) {
          return res.status(400).json({
            success: false,
            message: 'Content is required'
          });
        }

        // Additional validation for links
        if (type === 'link') {
          try {
            new URL(content);
          } catch (_) {
            return res.status(400).json({
              success: false,
              message: 'Invalid URL format'
            });
          }
        }
      }

      // Insert into database
      await pool.execute(
        `INSERT INTO knowledge_requests 
        (admin_id, title, type, content, description, file_path)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          title,
          type,
          content,
          description || null,
          filePath || null
        ]
      );

      res.json({ 
        success: true,
        message: 'Knowledge request submitted for NRSC approval'
      });

    } catch (error) {
      console.error('NRSC Knowledge submission error:', error);
      
      // Clean up uploaded file if error occurred
      if (req.file?.path) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('NRSC Error cleaning up file:', err);
        });
      }

      res.status(500).json({ 
        success: false,
        message: 'NRSC system: Failed to process request' 
      });
    }
  }
);

// Get user's knowledge requests
app.get('/api/knowledge-requests', 
  authenticateToken, 
  async (req, res) => {
    try {
      const [requests] = await pool.execute(
        `SELECT 
          id, 
          title, 
          type, 
          status, 
          created_at,
          decision_at,
          content
         FROM knowledge_requests 
         WHERE admin_id = ? 
         ORDER BY created_at DESC`,
        [req.user.id]
      );

      // Format response
      const formattedRequests = requests.map(request => ({
        id: request.id,
        title: request.title,
        type: request.type,
        status: request.status,
        date: request.created_at,
        decision_date: request.decision_at,
        content: request.type === 'pdf' ? null : request.content,
        file_url: request.type === 'pdf' ? 
          `/api/knowledge-files/${encodeURIComponent(request.content.replace('PDF:', ''))}` 
          : null
      }));

      res.json({
        success: true,
        requests: formattedRequests
      });
    } catch (error) {
      console.error('NRSC Knowledge request error:', error);
      res.status(500).json({ 
        success: false,
        message: 'NRSC system: Failed to fetch requests' 
      });
    }
  }
);


// Get pending knowledge requests (for superadmin)
app.get('/api/knowledge-requests/pending', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const [requests] = await pool.execute(
        `SELECT 
          kr.id,
          kr.title,
          kr.type,
          kr.content,
          kr.created_at,
          u.email AS admin_email
         FROM knowledge_requests kr
         JOIN users u ON kr.admin_id = u.id
         WHERE kr.status = 'pending'
         ORDER BY kr.created_at DESC`
      );

      res.json({
        success: true,
        requests
      });
    } catch (error) {
      console.error('NRSC Pending requests error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending requests'
      });
    }
  }
);



// Approve/Reject knowledge request
app.post('/api/knowledge-requests/:id/:action', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const { id, action } = req.params;
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
      }

      // Update request status
      await pool.execute(
        `UPDATE knowledge_requests 
         SET status = ?, decision_by = ?, decision_at = NOW()
         WHERE id = ?`,
        [
          action === 'approve' ? 'approved' : 'rejected',
          req.user.id,
          id
        ]
      );

      // Get the updated request
      const [request] = await pool.execute(
        `SELECT * FROM knowledge_requests WHERE id = ?`,
        [id]
      );

      res.json({
        success: true,
        message: `Request ${action}d successfully`,
        filePath: request[0]?.file_path || null
      });

    } catch (error) {
      console.error('NRSC Request action error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process request'
      });
    }
  }
);

// Serve uploaded files
app.get('/api/knowledge-files/:filename',
  authenticateToken,
  async (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const filePath = path.join(uploadDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'NRSC error: File not found'
        });
      }

      // Verify the user has permission to access this file
      const [request] = await pool.execute(
        `SELECT admin_id FROM knowledge_requests 
         WHERE content = ? AND type = 'pdf'`,
        [`PDF:${filename}`]
      );

      if (request.length === 0 || request[0].admin_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'NRSC security: Unauthorized access'
        });
      }

      res.sendFile(filePath, {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    } catch (error) {
      console.error('NRSC File download error:', error);
      res.status(500).json({
        success: false,
        message: 'NRSC system: File retrieval failed'
      });
    }
  }
);

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

// Create Admin Endpoint (Fixed with proper validation and error handling)
app.post('/api/create-admin', 
  authenticateToken,
  requireRole('superadmin'),
  [
    body('email').isEmail().withMessage('Valid email required')
      .custom(email => email.endsWith('@nrsc.gov.in')).withMessage('Only NRSC official emails allowed'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/).withMessage('Password must contain at least one number')
      .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character'),
    body('role').isIn(['admin', 'superadmin']).withMessage('Invalid role specified')
  ],
  async (req, res) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array().map(e => e.msg)
        });
      }

      const { email, password, role } = req.body;

      // Check if email already exists
      const [existing] = await pool.execute(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Admin with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create admin
      await pool.execute(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        [email, hashedPassword, role]
      );

      res.json({
        success: true,
        message: 'Admin created successfully'
      });

    } catch (error) {
      console.error('NRSC Admin creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during admin creation'
      });
    }
  }
);

// Sentiment Analysis Chart Endpoint 
app.get('/api/sentiment-data', 
  authenticateToken,
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const [results] = await pool.execute(
        `SELECT 
          SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
          SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
          SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
         FROM chat_logs
         WHERE timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)`
      );

      res.json({
        success: true,
        data: {
          positive: results[0].positive || 0,
          neutral: results[0].neutral || 0,
          negative: results[0].negative || 0
        }
      });
    } catch (error) {
      console.error('NRSC Sentiment analysis error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sentiment data'
      });
    }
  }
);

// ==================== TOTAL ADMINS ENDPOINT ====================

app.get('/api/total-admins', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
      const [results] = await pool.execute(
          'SELECT COUNT(*) AS count FROM users WHERE role IN ("admin", "superadmin")'
      );
      
      res.json({
          success: true,
          count: results[0].count
      });
  } catch (error) {
      console.error('Total admins error:', error);
      res.status(500).json({ 
          success: false,
          message: 'Failed to retrieve admin count' 
      });
  }
});

// ==================== REQUEST HISTORY ENDPOINT ====================
app.get('/api/request-history', authenticateToken, requireRole('superadmin'), async (req, res) => {
  try {
      const [requests] = await pool.execute(
          `SELECT 
              kr.id,
              kr.title,
              kr.type,
              kr.status,
              kr.created_at,
              kr.decision_at,
              u1.email AS admin_email,
              u2.email AS decided_by
          FROM knowledge_requests kr
          JOIN users u1 ON kr.admin_id = u1.id
          LEFT JOIN users u2 ON kr.decision_by = u2.id
          WHERE kr.status IN ('approved', 'rejected')
          ORDER BY kr.decision_at DESC`
      );

      res.json({
          success: true,
          requests: requests.map(r => ({
              ...r,
              decision: r.status.toUpperCase()
          }))
      });
  } catch (error) {
      console.error('Request history error:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to fetch request history'
      });
  }
});

// ==================== SERVER INITIALIZATION ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NRSC Authentication Server running on port ${PORT}`);
});
