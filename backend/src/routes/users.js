const express         = require('express');
const router          = express.Router();
const User            = require('../models/User');
const authMiddleware  = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.use(authMiddleware);

// ── GET current user profile (must be before /:id routes) ────────────────────
router.get('/me', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    res.json(user || req.user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET all users ─────────────────────────────────────────────────────────────
router.get('/', requireRole('pm', 'dm', 'sl'), async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).select('-__v');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADD user ──────────────────────────────────────────────────────────────────
router.post('/', requireRole('pm'), async (req, res) => {
  try {
    const { email, name, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailLower = email.toLowerCase().trim();

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const whitelistDoc = await db
      .collection('systemconfigs')
      .findOne({ key: 'domainWhitelist' });

    const allowedDomains = (
      whitelistDoc?.data?.domains || []
    ).map(d => d.toLowerCase().trim());

    if (allowedDomains.length > 0) {
      const domain = emailLower.split('@')[1];
      if (!allowedDomains.some(d => d === domain)) {
        return res.status(400).json({
          error: `Email domain @${domain} is not whitelisted`
        });
      }
    }

    const existing = await User.findOne({ email: emailLower });
    if (existing) {
      return res.status(400).json({
        error: 'User with this email already exists'
      });
    }

    const user = await User.create({
      email:    emailLower,
      name:     name?.trim() || '',
      role:     role || 'eng',
      isActive: true,
      addedBy:  req.user.email
    });

    res.json({ success: true, user });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE user role ──────────────────────────────────────────────────────────
router.put('/:id', requireRole('pm', 'dm'), async (req, res) => {
  try {
    const { role, isActive, name } = req.body;
    const requestorRole = req.user?.role;

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (requestorRole === 'dm') {
      if (targetUser.role !== 'eng') {
        return res.status(403).json({
          error: 'Duty Managers can only change Engineers roles'
        });
      }
      if (role && !['dm', 'sl', 'eng'].includes(role)) {
        return res.status(403).json({
          error: 'Duty Managers can only assign DM, SL or ENG roles'
        });
      }
    }

    const updates = {};
    if (role)                    updates.role     = role;
    if (name)                    updates.name     = name.trim();
    if (isActive !== undefined)  updates.isActive = isActive;

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    res.json({ success: true, user: updated });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE user ───────────────────────────────────────────────────────────────
router.delete('/:id', requireRole('pm'), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
