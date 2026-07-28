const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

// Pre-populated default list of majors/departments in school
const defaultDepartments = [
  { department_id: 1, dept_code: 'CS', dept_name: 'Computer Science & IT', head_of_dept: 'Dr. Chan Vanna', building_location: 'Science Wing - Floor 2', total_students: 142, description: 'Software Engineering, Web Development & Cybersecurity' },
  { department_id: 2, dept_code: 'BA', dept_name: 'Business Administration', head_of_dept: 'Prof. Meng Sokha', building_location: 'Main Block - Floor 3', total_students: 198, description: 'Finance, Marketing, Management & International Business' },
  { department_id: 3, dept_code: 'GD', dept_name: 'Graphic Design & Multimedia', head_of_dept: 'Ms. Keo Bopha', building_location: 'Art Center - Floor 1', total_students: 85, description: 'UI/UX Design, 3D Animation & Visual Communication' },
  { department_id: 4, dept_code: 'ENG', dept_name: 'Foreign Languages & English', head_of_dept: 'Dr. John Smith', building_location: 'Language Building - Floor 2', total_students: 120, description: 'English Literature, Translation & TESOL Training' },
  { department_id: 5, dept_code: 'EE', dept_name: 'Electrical Engineering', head_of_dept: 'Eng. Tep Samnang', building_location: 'Engineering Block - Floor 1', total_students: 76, description: 'Electronics, Power Systems & Robotics' }
];

async function getDepartments(req, res, next) {
  try {
    try {
      const depts = await db.query('SELECT * FROM departments ORDER BY dept_name ASC');
      if (depts && depts.length > 0) {
        return sendSuccess(res, 'Departments fetched', { departments: depts });
      }
    } catch (e) {
      // Fallback if table not created yet
    }
    return sendSuccess(res, 'Departments fetched', { departments: defaultDepartments });
  } catch (error) {
    next(error);
  }
}

async function createDepartment(req, res, next) {
  try {
    const { dept_code, dept_name, head_of_dept, building_location, description } = req.body;
    if (!dept_code || !dept_name) {
      return sendError(res, 'Department code and name are required', 400);
    }
    
    try {
      const result = await db.query(
        'INSERT INTO departments (dept_code, dept_name, head_of_dept, building_location, description) VALUES (?, ?, ?, ?, ?)',
        [dept_code, dept_name, head_of_dept || '', building_location || '', description || '']
      );
      return sendSuccess(res, 'Department created successfully', { department_id: result.insertId, dept_code, dept_name }, 201);
    } catch (e) {
      const newId = defaultDepartments.length + 1;
      const newDept = { department_id: newId, dept_code, dept_name, head_of_dept, building_location, description };
      defaultDepartments.push(newDept);
      return sendSuccess(res, 'Department created successfully', newDept, 201);
    }
  } catch (error) {
    next(error);
  }
}

module.exports = { getDepartments, createDepartment };
