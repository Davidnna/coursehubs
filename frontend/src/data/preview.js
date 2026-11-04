// EXPLICIT UI SAMPLE DATA. The live course/catalog API has not been implemented.
// Never present these records as real uploads or fetched course offerings.
export const levels = [100, 200, 300, 400, 500];

export const sampleCourses = [
  { id: 'csc-101', code: 'CSC 101', title: 'Introduction to Computer Science', level: 100, semester: 'First', topic: 'Foundations', type: 'Material', description: 'An example of how an introductory course would appear in the CourseHubs index.' },
  { id: 'csc-202', code: 'CSC 202', title: 'Data Structures & Algorithms', level: 200, semester: 'Second', topic: 'Programming', type: 'Past Question', description: 'An interface preview of course materials and linked past questions.' },
  { id: 'csc-301', code: 'CSC 301', title: 'Database Management Systems', level: 300, semester: 'First', topic: 'Databases', type: 'Model Answer', description: 'A sample course page demonstrating CourseHubs resource organization.' },
  { id: 'csc-305', code: 'CSC 305', title: 'Operating Systems', level: 300, semester: 'First', topic: 'Systems', type: 'Material', description: 'A sample course listing. No files have been uploaded to this preview.' },
  { id: 'csc-402', code: 'CSC 402', title: 'Computer Networks', level: 400, semester: 'Second', topic: 'Networking', type: 'Past Question', description: 'A preview of searchable course details and document types.' },
  { id: 'csc-501', code: 'CSC 501', title: 'Software Engineering', level: 500, semester: 'First', topic: 'Engineering', type: 'Material', description: 'An illustrative course page awaiting integration with the live API.' },
];

export const resourceTypes = ['All types', 'Material', 'Past Question', 'Model Answer'];
