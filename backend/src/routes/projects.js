import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { db } from '../db.js';
import { getProjectsQuery } from '../db.js';
import emitter from '../events.js';
import { authenticateToken, requirePermission, requireProjectOwnership } from '../middleware.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, '/app/uploads'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (jpeg, png, webp, gif)'));
  },
});

router.get('/', authenticateToken, requirePermission('projects:read'), async (req, res) => {
  try {
    const projects = await getProjectsQuery(db)
      .where('p.visibility', 'public')
      .orderBy('p.created_at', 'desc');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', authenticateToken, requirePermission('projects:read'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const userId = req.user.dbId || parseInt(req.user.sub, 10);

  try {
    const project = await getProjectsQuery(db).where('p.id', id).first();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (project.visibility !== 'public') {
      const userRole = await db('users as u')
        .join('roles as r', 'u.role_id', 'r.id')
        .where('u.id', userId)
        .first('r.name');

      if (project.author_id !== userId && userRole?.name !== 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You do not have permission to view this project' });
      }
    }

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.post('/', authenticateToken, requirePermission('projects:create'), async (req, res) => {
  const { title, description, visibility } = req.body;
  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  if (visibility && !['public', 'private'].includes(visibility)) {
    return res.status(400).json({ error: "visibility must be 'public' or 'private'" });
  }

  const userId = req.user.dbId || parseInt(req.user.sub, 10);

  try {
    const [project] = await db('projects')
      .insert({
        title: title.trim(),
        description: description.trim(),
        visibility: visibility || 'private',
        created_by: userId,
      })
      .returning('*');

    emitter.emit('ProjectCreated', {
      projectId: project.id,
      projectTitle: project.title,
      creatorId: project.created_by,
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', authenticateToken, requirePermission('projects:write'), requireProjectOwnership, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, description, visibility } = req.body;

  if (visibility && !['public', 'private'].includes(visibility)) {
    return res.status(400).json({ error: "visibility must be 'public' or 'private'" });
  }

  try {
    const [project] = await db('projects')
      .where({ id })
      .update({
        title: title?.trim() || db.raw('title'),
        description: description?.trim() || db.raw('description'),
        visibility: visibility || db.raw('visibility'),
        updated_at: db.fn.now(),
      })
      .returning('*');

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', authenticateToken, requirePermission('projects:write'), requireProjectOwnership, async (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    await db('projects').where({ id }).del();
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.post(
  '/:id/thumbnail',
  authenticateToken,
  requirePermission('projects:write'),
  requireProjectOwnership,
  upload.single('thumbnail'),
  async (req, res) => {
    const id = parseInt(req.params.id, 10);

    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

    try {
      const thumbnailUrl = `/uploads/${req.file.filename}`;
      const [project] = await db('projects')
        .where({ id })
        .update({ thumbnail_url: thumbnailUrl, updated_at: db.fn.now() })
        .returning('*');
        
      res.json({ message: 'Thumbnail uploaded', project });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save thumbnail' });
    }
  }
);

router.post('/:id/like', authenticateToken, requirePermission('projects:like'), async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const likerId = req.user.dbId || parseInt(req.user.sub, 10);

  try {
    const project = await db('projects as p')
      .join('users as u', 'p.created_by', 'u.id')
      .where('p.id', projectId)
      .andWhere('p.visibility', 'public')
      .select('p.id', 'p.title', 'p.created_by', 'u.name as owner_name')
      .first();

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const liker = await db('users').where('id', likerId).select('name', 'email').first();
    const likerName = liker?.name || liker?.email || 'Someone';

    const existing = await db('project_likes').where({ project_id: projectId, liked_by: likerId }).first();

    if (existing) {
      await db('project_likes').where({ project_id: projectId, liked_by: likerId }).del();
      const count = await db('project_likes').where({ project_id: projectId }).count('id as c').first();
      return res.json({ liked: false, like_count: parseInt(count.c, 10) });
    }

    await db('project_likes').insert({ project_id: projectId, liked_by: likerId });

    emitter.emit('ProjectLiked', {
      projectId,
      projectTitle: project.title,
      likerId,
      likerName,
      ownerId: project.created_by,
    });

    const count = await db('project_likes').where({ project_id: projectId }).count('id as c').first();
    res.json({ liked: true, like_count: parseInt(count.c, 10) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

export default router;
