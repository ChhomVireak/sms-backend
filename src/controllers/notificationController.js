const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');

// Auto-migration to guarantee all notification columns exist
(async () => {
  try {
    await db.query(`ALTER TABLE notifications MODIFY COLUMN user_id INT NULL DEFAULT NULL`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN target_audience VARCHAR(100) DEFAULT 'All Users'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN target_group_ids TEXT NULL`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN publish_date DATE NULL`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN priority VARCHAR(50) DEFAULT 'Medium'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN status VARCHAR(50) DEFAULT 'Published'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN type VARCHAR(50) DEFAULT 'ANNOUNCEMENT'`);
  } catch (e) {}
})();

async function getNotifications(req, res, next) {
  try {
    let query = 'SELECT * FROM notifications';
    let params = [];

    if (req.user) {
      const role = String(req.user.role || '').toUpperCase();
      if (role === 'TEACHER') {
        query += ` WHERE target_audience IN ('All Users', 'Teachers', 'TEACHER', 'ALL') OR target_audience IS NULL`;
      } else if (role === 'STUDENT') {
        query += ` WHERE target_audience IN ('All Users', 'Students', 'STUDENT', 'ALL') OR target_audience IS NULL`;
      }
    }

    query += ' ORDER BY notification_id DESC';
    let notifications = await db.query(query, params);

    // If user is a student, filter notifications targeted at specific class groups
    if (req.user && String(req.user.role || '').toUpperCase() === 'STUDENT') {
      let studentGroupId = null;
      const stuRows = await db.query('SELECT group_id FROM students WHERE user_id = ?', [req.user.userId]);
      if (stuRows.length > 0) studentGroupId = stuRows[0].group_id;

      notifications = notifications.filter(n => {
        if (!n.target_group_ids) return true;
        try {
          const groupIds = JSON.parse(n.target_group_ids);
          if (Array.isArray(groupIds) && groupIds.length > 0) {
            return studentGroupId ? groupIds.includes(Number(studentGroupId)) : false;
          }
        } catch (e) {
          const groupIds = String(n.target_group_ids).split(',').map(Number).filter(Boolean);
          if (groupIds.length > 0) {
            return studentGroupId ? groupIds.includes(Number(studentGroupId)) : false;
          }
        }
        return true;
      });
    }

    return sendSuccess(res, 'Notifications fetched', { notifications });
  } catch (error) {
    next(error);
  }
}

async function createNotification(req, res, next) {
  try {
    const { title, message, target_audience = 'All Users', target_group_ids, publish_date, priority = 'Medium', status = 'Published' } = req.body;

    if (!title || !message) {
      return sendError(res, 'Title and message are required', 400);
    }

    let targetGroupStr = null;
    if (target_group_ids) {
      if (Array.isArray(target_group_ids) && target_group_ids.length > 0) {
        targetGroupStr = JSON.stringify(target_group_ids.map(Number));
      } else if (typeof target_group_ids === 'string' && target_group_ids.trim()) {
        targetGroupStr = target_group_ids;
      }
    }

    const pubDate = publish_date || new Date().toISOString().slice(0, 10);
    const userId = req.user ? req.user.userId : null;

    const result = await db.query(
      `INSERT INTO notifications (user_id, title, message, target_audience, target_group_ids, publish_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, message, target_audience, targetGroupStr, pubDate, priority, status]
    );

    const newNotif = {
      notification_id: result.insertId,
      user_id: userId,
      title,
      message,
      target_audience,
      target_group_ids: targetGroupStr,
      publish_date: pubDate,
      priority,
      status
    };

    // Broadcast real-time websocket alert to teachers & students
    notifyRealtime('announcement_created', newNotif);

    return sendSuccess(res, 'Notification created and broadcasted successfully', newNotif, 201);
  } catch (error) {
    next(error);
  }
}

async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM notifications WHERE notification_id = ?', [id]);
    notifyRealtime('announcement_deleted', { id });
    return sendSuccess(res, 'Notification deleted');
  } catch (error) {
    next(error);
  }
}

module.exports = { getNotifications, createNotification, deleteNotification };
