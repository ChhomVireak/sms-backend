const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function getRooms(req, res, next) {
  try {
    const { day_of_week, slot_id, building } = req.query;

    let whereClauses = [];
    let params = [];

    if (building) {
      whereClauses.push('r.building LIKE ?');
      params.push(`%${building}%`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    let occupancyJoinSql = '';
    if (day_of_week && slot_id) {
      occupancyJoinSql = `
        LEFT JOIN (
          SELECT tt.room_id, g.group_code, sub.subject_name, t.first_name as teacher_fname
          FROM timetables tt
          JOIN student_groups g ON tt.group_id = g.group_id
          JOIN subjects sub ON tt.subject_id = sub.subject_id
          JOIN teachers t ON tt.teacher_id = t.teacher_id
          WHERE tt.day_of_week = ? AND tt.slot_id = ?
        ) occ ON r.room_id = occ.room_id
      `;
      params.unshift(day_of_week.toUpperCase(), slot_id);
    } else {
      occupancyJoinSql = `
        LEFT JOIN (
          SELECT tt.room_id, g.group_code, sub.subject_name, t.first_name as teacher_fname
          FROM timetables tt
          JOIN student_groups g ON tt.group_id = g.group_id
          JOIN subjects sub ON tt.subject_id = sub.subject_id
          JOIN teachers t ON tt.teacher_id = t.teacher_id
          LIMIT 1
        ) occ ON r.room_id = occ.room_id
      `;
    }

    const selectOccupancySql = `
      SELECT r.*, 
        occ.group_code as current_group, 
        occ.subject_name as current_subject, 
        occ.teacher_fname as current_teacher,
        (SELECT COUNT(*) FROM timetables tt WHERE tt.room_id = r.room_id) as total_scheduled_classes
      FROM rooms r
      ${occupancyJoinSql}
      ${whereSql}
      ORDER BY r.building ASC, r.room_number ASC
    `;

    const rooms = await db.query(selectOccupancySql, params);
    return sendSuccess(res, 'Rooms fetched', { rooms });
  } catch (error) {
    next(error);
  }
}

async function createRoom(req, res, next) {
  try {
    const { room_number, building = 'Main Block', capacity = 40 } = req.body;
    if (!room_number) {
      return sendError(res, 'Room number is required', 400);
    }
    const result = await db.query(
      'INSERT INTO rooms (room_number, building, capacity) VALUES (?, ?, ?)',
      [room_number, building, capacity]
    );
    return sendSuccess(res, 'Room created', { room_id: result.insertId, room_number }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateRoom(req, res, next) {
  try {
    const { id } = req.params;
    const { room_number, building, capacity } = req.body;
    await db.query(
      'UPDATE rooms SET room_number = ?, building = ?, capacity = ? WHERE room_id = ?',
      [room_number, building, capacity, id]
    );
    return sendSuccess(res, 'Room updated');
  } catch (error) {
    next(error);
  }
}

async function deleteRoom(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM rooms WHERE room_id = ?', [id]);
    return sendSuccess(res, 'Room deleted');
  } catch (error) {
    next(error);
  }
}

module.exports = { getRooms, createRoom, updateRoom, deleteRoom };
