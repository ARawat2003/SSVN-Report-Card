// Supabase Client
// TODO: Replace with your Supabase project URL and anon key
const SUPABASE_URL = 'https://fmnadtrrojcdakgwxqkl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtbmFkdHJyb2pjZGFrZ3d4cWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MjAwMjgsImV4cCI6MjA3ODE5NjAyOH0.D9ZNEn-LMnywLQXE9_xuEScqKPhvlTZCRIYLb4dy8oc';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Data Storage
let appData = {
    students: [],
    classes: {},
    marks: {},
    settings: {
        schoolName: 'ABC School',
        schoolAddress: '123 School Street',
        schoolEmail: 'info@abcschool.com',
        schoolPhone: '+1234567890',
        reopenDate: '2026-04-01',
        schoolLogo: '',
        principalSignature: ''
    }
};

// Initialize classes structure
function initializeClasses() {
    for (let i = 1; i <= 10; i++) {
        if (!appData.classes[i]) {
            appData.classes[i] = {
                subjects: []
            };
        }
    }
}

// Load data from Supabase
async function loadData() {
    try {
        // Fetch all data in parallel
        const { data: students, error: studentsError } = await _supabase.from('students').select('*');
        if (studentsError) throw studentsError;
        appData.students = students || [];

        const { data: subjects, error: subjectsError } = await _supabase.from('subjects').select('*');
        if (subjectsError) throw subjectsError;
        
        initializeClasses(); // Reset classes
        if (subjects) {
            subjects.forEach(subject => {
                if (appData.classes[subject.class_id]) {
                    appData.classes[subject.class_id].subjects.push({
                        name: subject.name,
                        maxMarks: {
                            ut: subject.max_ut,
                            sea: subject.max_sea,
                            notebook: subject.max_notebook,
                            termExam: subject.max_term_exam
                        }
                    });
                }
            });
        }

        const { data: marks, error: marksError } = await _supabase.from('marks').select('*');
        if (marksError) throw marksError;
        
        appData.marks = {};
        if (marks) {
            marks.forEach(mark => {
                if (!appData.marks[mark.student_roll_no]) {
                    appData.marks[mark.student_roll_no] = {};
                }
                if (!appData.marks[mark.student_roll_no][mark.term]) {
                    appData.marks[mark.student_roll_no][mark.term] = {};
                }
                appData.marks[mark.student_roll_no][mark.term][mark.subject_name] = {
                    ut: mark.ut,
                    sea: mark.sea,
                    notebook: mark.notebook,
                    termExam: mark.term_exam
                };
            });
        }

        const { data: settings, error: settingsError } = await _supabase.from('settings').select('*');
        if (settingsError) throw settingsError;

        if (settings) {
            settings.forEach(setting => {
                appData.settings[setting.key] = setting.value;
            });
        }

    } catch (error) {
        console.error('Error loading data from Supabase:', error);
        alert('Could not load data from the database. Please ensure your Supabase credentials are correct and the database tables are set up. Check the console for more details.');
        initializeClasses(); // Initialize with empty data on error
    }
    
    // Refresh the UI with the loaded data
    updateDashboard();
    displayStudents();
    displaySettings();
    // Display subjects for the initially selected class
    const selectedClass = document.getElementById('selectedClass').textContent;
    if (selectedClass) {
        displaySubjects(selectedClass);
    }
}

// Save all data to Supabase
async function saveData() {
    try {
        // 1. Save Students
        // Use upsert to insert new students or update existing ones based on rollNo
        const { error: studentError } = await _supabase.from('students').upsert(appData.students, { onConflict: 'rollNo' });
        if (studentError) throw studentError;

        // 2. Save Subjects
        // This is a bit more complex. We'll delete all subjects and re-insert them to ensure consistency.
        const { error: deleteSubjectsError } = await _supabase.from('subjects').delete().neq('name', 'a_dummy_value_to_delete_all'); // Trick to delete all rows
        if (deleteSubjectsError) throw deleteSubjectsError;

        const subjectsToInsert = [];
        for (const classNum in appData.classes) {
            appData.classes[classNum].subjects.forEach(s => {
                subjectsToInsert.push({
                    class_id: classNum,
                    name: s.name,
                    max_ut: s.maxMarks.ut,
                    max_sea: s.maxMarks.sea,
                    max_notebook: s.maxMarks.notebook,
                    max_term_exam: s.maxMarks.termExam
                });
            });
        }
        if (subjectsToInsert.length > 0) {
            const { error: subjectError } = await _supabase.from('subjects').insert(subjectsToInsert);
            if (subjectError) throw subjectError;
        }

        // 3. Save Marks
        // Similar to subjects, we'll clear and re-insert.
        const { error: deleteMarksError } = await _supabase.from('marks').delete().neq('subject_name', 'a_dummy_value_to_delete_all');
        if (deleteMarksError) throw deleteMarksError;

        const marksToInsert = [];
        for (const rollNo in appData.marks) {
            for (const term in appData.marks[rollNo]) {
                for (const subject in appData.marks[rollNo][term]) {
                    const m = appData.marks[rollNo][term][subject];
                    marksToInsert.push({
                        student_roll_no: rollNo,
                        term: term,
                        subject_name: subject,
                        ut: m.ut,
                        sea: m.sea,
                        notebook: m.notebook,
                        term_exam: m.termExam
                    });
                }
            }
        }
        if (marksToInsert.length > 0) {
            const { error: marksError } = await _supabase.from('marks').insert(marksToInsert);
            if (marksError) throw marksError;
        }

        // 4. Save Settings
        const settingsToUpsert = [];
        for (const key in appData.settings) {
            settingsToUpsert.push({ key: key, value: appData.settings[key] });
        }
        if (settingsToUpsert.length > 0) {
            const { error: settingsError } = await _supabase.from('settings').upsert(settingsToUpsert, { onConflict: 'key' });
            if (settingsError) throw settingsError;
        }

        console.log('Data saved to Supabase successfully!');

    } catch (error) {
        console.error('Error saving data to Supabase:', error);
        alert('Failed to save data. Please check the console for details.');
    }
}

// (App already initialized earlier in the file.)

// Sidebar Toggle
function initializeSidebar() {
    const toggleBtn = document.getElementById('toggleBtn');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    toggleBtn.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    });
}

// Navigation
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links and pages
            navLinks.forEach(l => l.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Show corresponding page
            const pageName = this.getAttribute('data-page');
            document.getElementById(pageName).classList.add('active');
            
            // Update page-specific content
            if (pageName === 'marks') {
                updateMarksPage();
            } else if (pageName === 'reportcards') {
                updateReportCardsPage();
            }
        });
    });
}

// Update Dashboard
function updateDashboard() {
    document.getElementById('totalStudents').textContent = appData.students.length;
    
    let totalSubjects = 0;
    for (let classNum in appData.classes) {
        totalSubjects += appData.classes[classNum].subjects.length;
    }
    document.getElementById('totalSubjects').textContent = totalSubjects;
    
    // Count generated reports (students with marks)
    let reportsCount = 0;
    appData.students.forEach(student => {
        const studentMarks = appData.marks[student.rollNo];
        if (studentMarks && Object.keys(studentMarks).length > 0) {
            reportsCount++;
        }
    });
    document.getElementById('totalReports').textContent = reportsCount;
}

// Students Page
function initializeStudentsPage() {
    const addStudentBtn = document.getElementById('addStudentBtn');
    addStudentBtn.addEventListener('click', function() {
        openStudentModal();
    });
    
    displayStudents();
}

function displayStudents() {
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = '';
    
    if (appData.students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">No students added yet. Click "Add Student" to get started.</td></tr>';
        return;
    }
    
    appData.students.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${student.rollNo}</td>
            <td>${student.name}</td>
            <td>${student.father || 'N/A'}</td>
            <td>Class ${student.class}</td>
            <td>${student.dob || 'N/A'}</td>
            <td>
                <button class="action-btn edit" onclick="editStudent(${index})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="deleteStudent(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openStudentModal(index = null) {
    const modal = document.getElementById('studentModal');
    const classSelect = document.getElementById('studentClass');
    
    // Populate class dropdown
    classSelect.innerHTML = '<option value="">Select Class</option>';
    for (let i = 1; i <= 10; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Class ${i}`;
        classSelect.appendChild(option);
    }
    
    if (index !== null) {
        const student = appData.students[index];
        document.getElementById('studentName').value = student.name;
        document.getElementById('studentDOB').value = student.dob || '';
        document.getElementById('studentFather').value = student.father || '';
        document.getElementById('studentMother').value = student.mother || '';
        document.getElementById('studentAddress').value = student.address || '';
        document.getElementById('studentClass').value = student.class;
        document.getElementById('studentRollNo').value = student.rollNo;
        document.getElementById('saveStudentBtn').setAttribute('data-index', index);
    } else {
        document.getElementById('studentName').value = '';
        document.getElementById('studentDOB').value = '';
        document.getElementById('studentFather').value = '';
        document.getElementById('studentMother').value = '';
        document.getElementById('studentAddress').value = '';
        document.getElementById('studentClass').value = '';
        document.getElementById('studentRollNo').value = '';
        document.getElementById('saveStudentBtn').removeAttribute('data-index');
    }
    
    modal.classList.add('active');
}

function editStudent(index) {
    openStudentModal(index);
}

function deleteStudent(index) {
    if (confirm('Are you sure you want to delete this student?')) {
        const student = appData.students[index];
        // Delete student's marks as well
        delete appData.marks[student.rollNo];
        appData.students.splice(index, 1);
        
        (async () => {
            await saveData();
            displayStudents();
            updateDashboard();
        })();
    }
}

// Initialize Modals
function initializeModals() {
    // Student Modal
    const studentModal = document.getElementById('studentModal');
    const closeStudentModal = document.getElementById('closeStudentModal');
    const saveStudentBtn = document.getElementById('saveStudentBtn');
    
    closeStudentModal.addEventListener('click', function() {
        studentModal.classList.remove('active');
    });
    
    saveStudentBtn.addEventListener('click', function() {
        const name = document.getElementById('studentName').value.trim();
        const dob = document.getElementById('studentDOB').value;
        const father = document.getElementById('studentFather').value.trim();
        const mother = document.getElementById('studentMother').value.trim();
        const address = document.getElementById('studentAddress').value.trim();
        const classNum = document.getElementById('studentClass').value;
        const rollNo = document.getElementById('studentRollNo').value.trim();
        
        if (!name || !dob || !father || !mother || !address || !classNum || !rollNo) {
            alert('Please fill in all required fields');
            return;
        }
        
        const index = this.getAttribute('data-index');
        const student = { 
            rollNo, 
            name, 
            dob, 
            father, 
            mother, 
            address, 
            class: classNum 
        };
        
        if (index !== null) {
            const oldStudent = appData.students[index];
            // Check if roll number changed and is duplicate
            if (oldStudent.rollNo !== rollNo && appData.students.some(s => s.rollNo === rollNo)) {
                alert('A student with this roll number already exists');
                return;
            }
            // Update marks reference if roll number changed
            if (oldStudent.rollNo !== rollNo && appData.marks[oldStudent.rollNo]) {
                appData.marks[rollNo] = appData.marks[oldStudent.rollNo];
                delete appData.marks[oldStudent.rollNo];
            }
            appData.students[index] = student;
        } else {
            // Check for duplicate roll number
            if (appData.students.some(s => s.rollNo === rollNo)) {
                alert('A student with this roll number already exists');
                return;
            }
            appData.students.push(student);
        }
        
        (async () => {
            await saveData();
            displayStudents();
            updateDashboard();
            studentModal.classList.remove('active');
        })();
    });
    
    // Subject Modal
    const subjectModal = document.getElementById('subjectModal');
    const closeSubjectModal = document.getElementById('closeSubjectModal');
    const saveSubjectBtn = document.getElementById('saveSubjectBtn');
    
    closeSubjectModal.addEventListener('click', function() {
        subjectModal.classList.remove('active');
    });
    
    saveSubjectBtn.addEventListener('click', function() {
        const subjectName = document.getElementById('subjectName').value.trim();
        const maxUT = parseInt(document.getElementById('maxUT').value) || 0;
        const maxSEA = parseInt(document.getElementById('maxSEA').value) || 0;
        const maxNoteBook = parseInt(document.getElementById('maxNoteBook').value) || 0;
        const maxTermExam = parseInt(document.getElementById('maxTermExam').value) || 0;
        
        if (!subjectName) {
            alert('Please enter subject name');
            return;
        }
        
        const classNum = document.getElementById('selectedClass').textContent;
        const subject = {
            name: subjectName,
            maxMarks: {
                ut: maxUT,
                sea: maxSEA,
                notebook: maxNoteBook,
                termExam: maxTermExam
            }
        };
        
        const editIndex = saveSubjectBtn.getAttribute('data-index');
        if (editIndex !== null) {
            appData.classes[classNum].subjects[editIndex] = subject;
        } else {
            appData.classes[classNum].subjects.push(subject);
        }
        
        (async () => {
            await saveData();
            displaySubjects(classNum);
            updateDashboard();
            subjectModal.classList.remove('active');
        })();
    });
    
    // Close modals on outside click
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });
}

// Classes Page
function initializeClassButtons() {
    const classButtons = document.getElementById('classButtons');
    // clear any existing buttons to avoid duplicates when called multiple times
    classButtons.innerHTML = '';

    for (let i = 1; i <= 10; i++) {
        const btn = document.createElement('button');
        btn.className = 'class-btn';
        btn.textContent = `Class ${i}`;
        btn.setAttribute('data-class', i);
        
        if (i === 1) {
            btn.classList.add('active');
        }
        
        btn.addEventListener('click', function() {
            document.querySelectorAll('.class-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const classNum = this.getAttribute('data-class');
            document.getElementById('selectedClass').textContent = classNum;
            displaySubjects(classNum);
        });
        
        classButtons.appendChild(btn);
    }
    
    displaySubjects(1);
}

function initializeClassesPage() {
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    addSubjectBtn.addEventListener('click', function() {
        openSubjectModal();
    });
}

function displaySubjects(classNum) {
    const container = document.getElementById('subjectsContainer');
    container.innerHTML = '';
    
    const subjects = appData.classes[classNum].subjects;
    
    if (subjects.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-book"></i><h3>No subjects added yet</h3><p>Click "Add Subject" to configure subjects for this class</p></div>';
        return;
    }
    
    subjects.forEach((subject, index) => {
        const subjectCard = document.createElement('div');
        subjectCard.className = 'subject-card';
        subjectCard.innerHTML = `
            <div class="subject-header">
                <h4>${subject.name}</h4>
                <div>
                    <button class="action-btn edit" onclick="editSubject(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteSubject(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="subject-marks">
                <div class="mark-item">
                    <label>UT:</label>
                    <span>${subject.maxMarks.ut}</span>
                </div>
                <div class="mark-item">
                    <label>SEA:</label>
                    <span>${subject.maxMarks.sea}</span>
                </div>
                <div class="mark-item">
                    <label>NoteBook:</label>
                    <span>${subject.maxMarks.notebook}</span>
                </div>
                <div class="mark-item">
                    <label>Term Exam:</label>
                    <span>${subject.maxMarks.termExam}</span>
                </div>
            </div>
        `;
        container.appendChild(subjectCard);
    });
}

function openSubjectModal(index = null) {
    const modal = document.getElementById('subjectModal');
    const classNum = document.getElementById('selectedClass').textContent;
    
    if (index !== null) {
        const subject = appData.classes[classNum].subjects[index];
        document.getElementById('subjectName').value = subject.name;
        document.getElementById('maxUT').value = subject.maxMarks.ut;
        document.getElementById('maxSEA').value = subject.maxMarks.sea;
        document.getElementById('maxNoteBook').value = subject.maxMarks.notebook;
        document.getElementById('maxTermExam').value = subject.maxMarks.termExam;
        document.getElementById('saveSubjectBtn').setAttribute('data-index', index);
    } else {
        document.getElementById('subjectName').value = '';
        document.getElementById('maxUT').value = '';
        document.getElementById('maxSEA').value = '';
        document.getElementById('maxNoteBook').value = '';
        document.getElementById('maxTermExam').value = '';
        document.getElementById('saveSubjectBtn').removeAttribute('data-index');
    }
    
    modal.classList.add('active');
}

function editSubject(index) {
    openSubjectModal(index);
}

function deleteSubject(index) {
    if (confirm('Are you sure you want to delete this subject?')) {
        const classNum = document.getElementById('selectedClass').textContent;
        appData.classes[classNum].subjects.splice(index, 1);
        
        (async () => {
            await saveData();
            displaySubjects(classNum);
            updateDashboard();
        })();
    }
}

// Marks Page
function initializeMarksPage() {
    const marksClassSelect = document.getElementById('marksClassSelect');
    const marksStudentSelect = document.getElementById('marksStudentSelect');
    const marksTermSelect = document.getElementById('marksTermSelect');
    
    // Populate class dropdown
    // make population idempotent (clear before appending) to avoid duplicate options
    marksClassSelect.innerHTML = '<option value="">Select Class</option>';
    for (let i = 1; i <= 10; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Class ${i}`;
        marksClassSelect.appendChild(option);
    }
    
    marksClassSelect.addEventListener('change', function() {
        updateStudentDropdown(this.value, marksStudentSelect);
        document.getElementById('marksEntry').innerHTML = '';
    });
    
    marksStudentSelect.addEventListener('change', function() {
        if (marksTermSelect.value) {
            displayMarksEntry();
        }
    });
    
    marksTermSelect.addEventListener('change', function() {
        if (marksStudentSelect.value) {
            displayMarksEntry();
        }
    });
}

function updateMarksPage() {
    const marksClassSelect = document.getElementById('marksClassSelect');
    if (marksClassSelect.value) {
        updateStudentDropdown(marksClassSelect.value, document.getElementById('marksStudentSelect'));
    }
}

function updateStudentDropdown(classNum, selectElement) {
    selectElement.innerHTML = '<option value="">Select Student</option>';
    
    const students = appData.students.filter(s => s.class == classNum);
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.rollNo;
        option.textContent = `${student.name} (${student.rollNo})`;
        selectElement.appendChild(option);
    });
}

function displayMarksEntry() {
    const classNum = document.getElementById('marksClassSelect').value;
    const rollNo = document.getElementById('marksStudentSelect').value;
    const term = document.getElementById('marksTermSelect').value;
    
    if (!classNum || !rollNo || !term) return;
    
    const subjects = appData.classes[classNum].subjects;
    const container = document.getElementById('marksEntry');
    container.innerHTML = '';
    
    if (subjects.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-book"></i><h3>No subjects configured</h3><p>Please add subjects in the Classes section first</p></div>';
        return;
    }
    
    subjects.forEach((subject, index) => {
        const subjectCard = document.createElement('div');
        subjectCard.className = 'marks-subject-card';
        
        // Get existing marks if any
        const existingMarks = appData.marks[rollNo]?.[term]?.[subject.name] || {};
        
        subjectCard.innerHTML = `
            <h4>${subject.name}</h4>
            <div class="marks-inputs">
                <div class="form-group">
                    <label>UT (Max: ${subject.maxMarks.ut})</label>
                    <input type="number" class="form-input" data-subject="${subject.name}" data-type="ut" 
                           max="${subject.maxMarks.ut}" min="0" value="${existingMarks.ut || ''}" 
                           placeholder="Enter marks">
                </div>
                <div class="form-group">
                    <label>SEA (Max: ${subject.maxMarks.sea})</label>
                    <input type="number" class="form-input" data-subject="${subject.name}" data-type="sea" 
                           max="${subject.maxMarks.sea}" min="0" value="${existingMarks.sea || ''}" 
                           placeholder="Enter marks">
                </div>
                <div class="form-group">
                    <label>NoteBook (Max: ${subject.maxMarks.notebook})</label>
                    <input type="number" class="form-input" data-subject="${subject.name}" data-type="notebook" 
                           max="${subject.maxMarks.notebook}" min="0" value="${existingMarks.notebook || ''}" 
                           placeholder="Enter marks">
                </div>
                <div class="form-group">
                    <label>Term Exam (Max: ${subject.maxMarks.termExam})</label>
                    <input type="number" class="form-input" data-subject="${subject.name}" data-type="termExam" 
                           max="${subject.maxMarks.termExam}" min="0" value="${existingMarks.termExam || ''}" 
                           placeholder="Enter marks">
                </div>
            </div>
        `;
        container.appendChild(subjectCard);
    });
    
    // Add save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Marks';
    saveBtn.style.marginTop = '20px';
    saveBtn.addEventListener('click', saveMarks);
    container.appendChild(saveBtn);
}

function saveMarks() {
    const rollNo = document.getElementById('marksStudentSelect').value;
    const term = document.getElementById('marksTermSelect').value;
    const classNum = document.getElementById('marksClassSelect').value;
    
    if (!appData.marks[rollNo]) {
        appData.marks[rollNo] = {};
    }
    if (!appData.marks[rollNo][term]) {
        appData.marks[rollNo][term] = {};
    }
    
    const inputs = document.querySelectorAll('#marksEntry input[type="number"]');
    const subjects = appData.classes[classNum].subjects;
    
    let isValid = true;
    inputs.forEach(input => {
        const subjectName = input.getAttribute('data-subject');
        const type = input.getAttribute('data-type');
        const value = parseFloat(input.value);
        const max = parseFloat(input.getAttribute('max'));
        
        if (value > max) {
            alert(`Marks for ${subjectName} ${type} cannot exceed maximum marks (${max})`);
            isValid = false;
            return;
        }
        
        if (!appData.marks[rollNo][term][subjectName]) {
            appData.marks[rollNo][term][subjectName] = {};
        }
        
        appData.marks[rollNo][term][subjectName][type] = value || 0;
    });
    
    if (isValid) {
        (async () => {
            await saveData();
            alert('Marks saved successfully!');
            updateDashboard();
        })();
    }
}

// Report Cards Page
function initializeReportCardsPage() {
    const reportClassSelect = document.getElementById('reportClassSelect');
    const reportStudentSelect = document.getElementById('reportStudentSelect');
    const generateReportBtn = document.getElementById('generateReportBtn');
    
    // Populate class dropdown
    // make population idempotent (clear before appending) to avoid duplicate options
    reportClassSelect.innerHTML = '<option value="">Select Class</option>';
    for (let i = 1; i <= 10; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Class ${i}`;
        reportClassSelect.appendChild(option);
    }
    
    reportClassSelect.addEventListener('change', function() {
        updateStudentDropdown(this.value, reportStudentSelect);
        document.getElementById('reportPreview').innerHTML = '';
    });
    
    generateReportBtn.addEventListener('click', generateReport);
}

function updateReportCardsPage() {
    const reportClassSelect = document.getElementById('reportClassSelect');
    if (reportClassSelect.value) {
        updateStudentDropdown(reportClassSelect.value, document.getElementById('reportStudentSelect'));
    }
}

function generateReport() {
    const classNum = document.getElementById('reportClassSelect').value;
    const rollNo = document.getElementById('reportStudentSelect').value;
    
    if (!classNum || !rollNo) {
        alert('Please select class and student');
        return;
    }
    
    const student = appData.students.find(s => s.rollNo === rollNo);
    const subjects = appData.classes[classNum].subjects;
    
    if (!subjects || subjects.length === 0) {
        alert('No subjects configured for this class. Please add subjects first.');
        return;
    }
    
    const studentMarks = appData.marks[rollNo];
    
    if (!studentMarks || (!studentMarks.term1 && !studentMarks.term2 && !studentMarks.term3)) {
        alert('No marks entered for this student. Please enter marks first.');
        return;
    }
    
    const reportPreview = document.getElementById('reportPreview');
    
    // Calculate marks for all three terms
    let term1Total = 0, term2Total = 0, term3Total = 0;
    let term1Max = 0, term2Max = 0, term3Max = 0;
    
    let tableRows = '';
    
    // Generate maximum marks row
    let maxMarksRow = '<tr class="max-marks-row"><td class="subject-name">Subjects</td>';
    maxMarksRow += `<td colspan="4"><strong>UT 1</strong></td><td><strong>Note<br/>Book</strong></td><td><strong>SEA</strong></td><td><strong>Term 1<br/>Exam</strong></td><td><strong>Total</strong></td>`;
    maxMarksRow += `<td colspan="4"><strong>UT 2</strong></td><td><strong>Note<br/>Book</strong></td><td><strong>SEA</strong></td><td><strong>Term 2<br/>Exam</strong></td><td><strong>Total</strong></td>`;
    maxMarksRow += `<td colspan="4"><strong>UT 3</strong></td><td><strong>Note<br/>Book</strong></td><td><strong>SEA</strong></td><td><strong>Term 3<br/>Exam</strong></td><td><strong>Total</strong></td>`;
    maxMarksRow += `<td><strong>Grand<br/>Total</strong></td></tr>`;
    
    // Calculate max marks per subject
    let maxUT = 0, maxNB = 0, maxSEA = 0, maxTermExam = 0;
    if (subjects.length > 0) {
        maxUT = subjects[0].maxMarks.ut;
        maxNB = subjects[0].maxMarks.notebook;
        maxSEA = subjects[0].maxMarks.sea;
        maxTermExam = subjects[0].maxMarks.termExam;
    }
    
    let maxPerTerm = maxUT + maxNB + maxSEA + maxTermExam;
    
    // Add max marks values row (single well-formed TR covering all three terms + grand total)
    tableRows += `<tr class="max-marks-row">
        <td class="subject-name"></td>
        <td colspan="4"><strong>${maxUT}</strong></td>
        <td><strong>${maxNB}</strong></td>
        <td><strong>${maxSEA}</strong></td>
        <td><strong>${maxTermExam}</strong></td>
        <td><strong>${maxPerTerm}</strong></td>

        <td colspan="4"><strong>${maxUT}</strong></td>
        <td><strong>${maxNB}</strong></td>
        <td><strong>${maxSEA}</strong></td>
        <td><strong>${maxTermExam}</strong></td>
        <td><strong>${maxPerTerm}</strong></td>

        <td colspan="4"><strong>${maxUT}</strong></td>
        <td><strong>${maxNB}</strong></td>
        <td><strong>${maxSEA}</strong></td>
        <td><strong>${maxTermExam}</strong></td>
        <td><strong>${maxPerTerm}</strong></td>

        <td><strong>${maxPerTerm * 3}</strong></td>
    </tr>`;
    
    subjects.forEach(subject => {
        const term1Marks = studentMarks.term1?.[subject.name] || {};
        const term2Marks = studentMarks.term2?.[subject.name] || {};
        const term3Marks = studentMarks.term3?.[subject.name] || {};
        
        const t1Obtained = (term1Marks.ut || 0) + (term1Marks.notebook || 0) + (term1Marks.sea || 0) + (term1Marks.termExam || 0);
        const t2Obtained = (term2Marks.ut || 0) + (term2Marks.notebook || 0) + (term2Marks.sea || 0) + (term2Marks.termExam || 0);
        const t3Obtained = (term3Marks.ut || 0) + (term3Marks.notebook || 0) + (term3Marks.sea || 0) + (term3Marks.termExam || 0);
        
        term1Total += t1Obtained;
        term2Total += t2Obtained;
        term3Total += t3Obtained;
        
        const subjectMax = subject.maxMarks.ut + subject.maxMarks.notebook + subject.maxMarks.sea + subject.maxMarks.termExam;
        term1Max += subjectMax;
        term2Max += subjectMax;
        term3Max += subjectMax;
        
        tableRows += `
            <tr>
                <td class="subject-name">${subject.name}</td>
                <td colspan="4">${term1Marks.ut || 0}</td>
                <td>${term1Marks.notebook || 0}</td>
                <td>${term1Marks.sea || 0}</td>
                <td>${term1Marks.termExam || 0}</td>
                <td class="term-total">${t1Obtained}</td>
                <td colspan="4">${term2Marks.ut || 0}</td>
                <td>${term2Marks.notebook || 0}</td>
                <td>${term2Marks.sea || 0}</td>
                <td>${term2Marks.termExam || 0}</td>
                <td class="term-total">${t2Obtained}</td>
                <td colspan="4">${term3Marks.ut || 0}</td>
                <td>${term3Marks.notebook || 0}</td>
                <td>${term3Marks.sea || 0}</td>
                <td>${term3Marks.termExam || 0}</td>
                <td class="term-total">${t3Obtained}</td>
                <td class="term-total">${t1Obtained + t2Obtained + t3Obtained}</td>
            </tr>
        `;
    });
    
    const grandTotal = term1Total + term2Total + term3Total;
    const grandMax = term1Max + term2Max + term3Max;
    const percentage = grandMax > 0 ? ((grandTotal / grandMax) * 100).toFixed(2) : 0;
    
    let grade = 'F';
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B+';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= 40) grade = 'D';
    
    const currentYear = new Date().getFullYear();
    
    reportPreview.innerHTML = `
        <div class="print-buttons" style="margin-bottom: 20px; display: flex; gap: 10px;">
            <button class="btn btn-primary" onclick="window.print()">
                <i class="fas fa-print"></i> Print Report Card
            </button>
        </div>
        <div class="report-card">
            <div class="report-header">
                <div class="school-logo">
                    ${appData.settings.schoolLogo ? 
                        `<img src="${appData.settings.schoolLogo}" alt="School Logo" class="logo-image">` : 
                        `<i class="fas fa-graduation-cap" style="font-size: 40px;"></i>`
                    }
                </div>
                <div class="school-info">
                    <h1>${appData.settings.schoolName}</h1>
                    <h2>${appData.settings.schoolAddress}</h2>
                    <h3>Progress Report Card ${currentYear}-${(currentYear + 1).toString().slice(-2)}</h3>
                </div>
                <div class="contact-info">
                    <i class="fas fa-phone"></i> ${appData.settings.schoolPhone}
                </div>
            </div>
            
            <table class="student-info-table">
                <tr>
                    <td>Name :</td>
                    <td>${student.name}</td>
                    <td>Class :</td>
                    <td>${classNum}${getOrdinal(classNum)}</td>
                    <td>Roll No :</td>
                    <td>${student.rollNo}</td>
                </tr>
                <tr>
                    <td>Father :</td>
                    <td>${student.father || 'N/A'}</td>
                    <td>Mother :</td>
                    <td>${student.mother || 'N/A'}</td>
                    <td>DOB :</td>
                    <td>${formatDate(student.dob)}</td>
                </tr>
            </table>
            
            <div class="scholastic-header">Scholastic Area</div>
            
            <div class="marks-table">
                <table>
                    ${maxMarksRow}
                    ${tableRows}
                    <tr class="total-row">
                        <td class="subject-name" colspan="8"></td>
                        <td class="term-total">${term1Total}</td>
                        <td colspan="7"></td>
                        <td class="term-total">${term2Total}</td>
                        <td colspan="7"></td>
                        <td class="term-total">${term3Total}</td>
                        <td class="term-total">${grandTotal}</td>
                    </tr>
                </table>
            </div>
            
            <div class="bottom-section">
                <div class="co-scholastic">
                    <div class="co-scholastic-header">Co-Scholastic Area</div>
                    <table>
                        <tr>
                            <td>PT Grade</td>
                            <td>A</td>
                        </tr>
                        <tr>
                            <td>Conversation</td>
                            <td>A+</td>
                        </tr>
                        <tr>
                            <td>Discipline</td>
                            <td>A+</td>
                        </tr>
                        <tr>
                            <td>Conduct and Behaviour</td>
                            <td>Good</td>
                        </tr>
                    </table>
                </div>
                
                <div class="marks-summary">
                    <div class="marks-summary-header">Marks</div>
                    <table>
                        <tr>
                            <td>Total Obtained Marks</td>
                            <td>${grandTotal}</td>
                        </tr>
                        <tr>
                            <td>Total Maximum Marks</td>
                            <td>${grandMax}</td>
                        </tr>
                        <tr>
                            <td>Percentage</td>
                            <td>${percentage}</td>
                        </tr>
                        <tr>
                            <td>Result</td>
                            <td>${percentage >= 40 ? 'Passed' : 'Failed'}</td>
                        </tr>
                        <tr>
                            <td>Rank in class</td>
                            <td></td>
                        </tr>
                    </table>
                </div>
            </div>
            
            <div class="signature-section">
                <div class="signature-box">
                    <div class="signature-line">Class Teacher</div>
                </div>
                <div class="signature-box">
                    ${appData.settings.principalSignature ? 
                        `<img src="${appData.settings.principalSignature}" alt="Principal Signature" class="signature-image">` : 
                        ''
                    }
                    <div class="signature-line">Principal</div>
                </div>
            </div>
            
            <div class="note-section-bottom">
                <p><strong>Note:</strong> The School will be reopened on ${formatReopenDate(appData.settings.reopenDate)}</p>
            </div>
        </div>
    `;
}

function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatReopenDate(dateStr) {
    if (!dateStr) return '1<sup>st</sup> April, 2026';
    const date = new Date(dateStr);
    const day = date.getDate();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const year = date.getFullYear();
    
    // Get ordinal suffix
    const suffix = getOrdinal(day);
    return `${day}<sup>${suffix}</sup> ${months[date.getMonth()]}, ${year}`;
}

// Settings Page
function initializeSettingsPage() {
    // Load current settings
    document.getElementById('schoolName').value = appData.settings.schoolName;
    document.getElementById('schoolAddress').value = appData.settings.schoolAddress;
    document.getElementById('schoolEmail').value = appData.settings.schoolEmail;
    document.getElementById('schoolPhone').value = appData.settings.schoolPhone;
    document.getElementById('reopenDate').value = appData.settings.reopenDate || '2026-04-01';
    
    // Display existing logo and signature if available
    if (appData.settings.schoolLogo) {
        document.getElementById('logoPreview').innerHTML = `<img src="${appData.settings.schoolLogo}" alt="School Logo">`;
    }
    if (appData.settings.principalSignature) {
        document.getElementById('signaturePreview').innerHTML = `<img src="${appData.settings.principalSignature}" alt="Principal Signature">`;
    }
    
    // Handle logo upload
    document.getElementById('schoolLogo').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                appData.settings.schoolLogo = event.target.result;
                document.getElementById('logoPreview').innerHTML = `<img src="${event.target.result}" alt="School Logo">`;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Handle signature upload
    document.getElementById('principalSignature').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                appData.settings.principalSignature = event.target.result;
                document.getElementById('signaturePreview').innerHTML = `<img src="${event.target.result}" alt="Principal Signature">`;
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Save settings
    document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
        appData.settings.schoolName = document.getElementById('schoolName').value;
        appData.settings.schoolAddress = document.getElementById('schoolAddress').value;
        appData.settings.schoolEmail = document.getElementById('schoolEmail').value;
        appData.settings.schoolPhone = document.getElementById('schoolPhone').value;
        appData.settings.reopenDate = document.getElementById('reopenDate').value;
        
        await saveData();
        alert('Settings saved successfully!');
    });
    
    // Clear all data
    document.getElementById('clearDataBtn').addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone!')) {
            if (confirm('This will delete all students, marks, and subjects from Excel files. Are you absolutely sure?')) {
                // Clear in-memory data
                appData.students = [];
                appData.marks = {};
                initializeClasses();
                localStorage.removeItem('reportCardSettings');
                
                // Save empty data to all Excel files
                (async () => {
                    for (let i = 1; i <= 10; i++) {
                        await saveClassData(i);
                    }
                    alert('All data cleared successfully! Excel files have been reset.');
                    location.reload();
                })();
            }
        }
    });
    
    // Export data
    document.getElementById('exportDataBtn').addEventListener('click', function() {
        const dataStr = JSON.stringify(appData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'report-card-data.json';
        link.click();
        URL.revokeObjectURL(url);
    });
}

function displaySettings() {
    document.getElementById('schoolName').value = appData.settings.schoolName || '';
    document.getElementById('schoolAddress').value = appData.settings.schoolAddress || '';
    document.getElementById('schoolEmail').value = appData.settings.schoolEmail || '';
    document.getElementById('schoolPhone').value = appData.settings.schoolPhone || '';
    document.getElementById('reopenDate').value = appData.settings.reopenDate || '';

    const logoPreview = document.getElementById('logoPreview');
    if (appData.settings.schoolLogo) {
        logoPreview.innerHTML = `<img src="${appData.settings.schoolLogo}" alt="School Logo">`;
    } else {
        logoPreview.innerHTML = '';
    }

    const signaturePreview = document.getElementById('signaturePreview');
    if (appData.settings.principalSignature) {
        signaturePreview.innerHTML = `<img src="${appData.settings.principalSignature}" alt="Principal Signature">`;
    } else {
        signaturePreview.innerHTML = '';
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    await loadData();
    initializeNavigation();
    initializeSidebar();
    initializeClassButtons();
    initializeModals();
    initializeStudentsPage();
    initializeClassesPage();
    initializeMarksPage();
    initializeReportCardsPage();
    initializeSettingsPage();
});