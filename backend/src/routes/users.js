import { Router } from 'express';
import { db, getProjectsQuery } from '../db.js';
import emitter from '../events.js';
import { authenticateToken, requirePermission } from '../middleware.js';

const router = Router();

router.get('/:id/profile', authenticateToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const authUserId = req.user.dbId || parseInt(req.user.sub, 10);

  try {
    const user = await db('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select('u.id', 'u.name', 'u.email', 'u.avatar_url', 'r.name as role')
      .where('u.id', userId)
      .first();

    if (!user) return res.status(404).json({ error: 'User not found' });

    let projectsQuery = getProjectsQuery(db).where('p.created_by', userId);
    
    if (userId !== authUserId) {
      projectsQuery = projectsQuery.andWhere('p.visibility', 'public');
    }
    
    const projects = await projectsQuery.orderBy('p.created_at', 'desc');

    const followerCount = await db('student_follows').where('student_id', userId).count('id as c').first();

    res.json({
      user,
      projects,
      follower_count: parseInt(followerCount.c, 10),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.post('/:id/follow', authenticateToken, requirePermission('users:follow'), async (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const followerId = req.user.dbId || parseInt(req.user.sub, 10);

  if (studentId === followerId) {
    return res.status(400).json({ error: 'You cannot follow yourself' });
  }

  try {
    const target = await db('users').where({ id: studentId }).select('id', 'name', 'email').first();
    if (!target) return res.status(404).json({ error: 'User not found' });

    const follower = await db('users').where({ id: followerId }).select('name', 'email').first();
    const followerName = follower?.name || follower?.email || 'Someone';

    const existing = await db('student_follows').where({ follower_id: followerId, student_id: studentId }).first();

    if (existing) {
      await db('student_follows').where({ follower_id: followerId, student_id: studentId }).del();
      return res.json({ following: false });
    }

    await db('student_follows').insert({ follower_id: followerId, student_id: studentId });

    emitter.emit('StudentFollowed', { followerId, followerName, studentId });

    res.json({ following: true, message: `You are now following ${target.name || target.email}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

router.get('/notifications', authenticateToken, async (req, res) => {
  const userId = req.user.dbId || parseInt(req.user.sub, 10);
  try {
    const notifications = await db('notifications as n')
      .leftJoin('users as u', 'n.actor_id', 'u.id')
      .select('n.id', 'n.type', 'n.payload', 'n.read', 'n.created_at',
              'u.name as actor_name', 'u.email as actor_email', 'u.avatar_url as actor_avatar')
      .where('n.recipient_id', userId)
      .orderBy('n.created_at', 'desc')
      .limit(50);
      
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.patch('/notifications/read-all', authenticateToken, async (req, res) => {
  const userId = req.user.dbId || parseInt(req.user.sub, 10);
  try {
    await db('notifications')
      .where({ recipient_id: userId, read: false })
      .update({ read: true });
      
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

router.patch('/notifications/:id/read', authenticateToken, async (req, res) => {
  const notifId = parseInt(req.params.id, 10);
  const userId = req.user.dbId || parseInt(req.user.sub, 10);
  try {
    const [notification] = await db('notifications')
      .where({ id: notifId, recipient_id: userId })
      .update({ read: true })
      .returning('*');

    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

export default router;
