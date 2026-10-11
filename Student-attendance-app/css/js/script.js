// ==========================================================
// One script used by all pages. Each page's <body> has a
// data-page="..." attribute that tells us which code to run.
// ==========================================================

// Address of the backend. We will build it in the next phases.
// If you later serve the frontend from the backend itself, change this to '/api'.
const API_BASE = 'http://localhost:5000/api';

// ---------- Helpers ----------

// $('id') is a shortcut for document.getElementById('id')
function $(id) {
    return document.getElementById(id);
}

// Show a message in the element with id="message".
// textContent (not innerHTML) is used so that user data can never run as code.
function showMessage(text, isError = true) {
    const box = $('message');
    if (!box) return;
    box.textContent = text;
    box.classList.remove('hidden');
    box.classList.toggle('error', isError);
}

function hideMessage() {
    const box = $('message');
    if (box) box.classList.add('hidden');
}

// All calls to the backend go through this one function.
async function request(path, { method = 'GET', body } = {}) {
    let response;
    try {
        response = await fetch(API_BASE + path, {
            method,
            credentials: 'include', // send/receive the secure login cookie
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'attendance-app', // extra CSRF protection, checked by the server later
            },
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new Error('Cannot reach the server. Please check that the backend is running.');
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        // the response had no JSON body
    }

    if (!response.ok) {
        throw new Error((data && data.message) || 'Request failed (' + response.status + ')');
    }
    return data;
}

const api = {
    register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    studentSummary: () => request('/attendance/my-summary'),
    mySubjects: () => request('/subjects'),
};

function dashboardFor(role) {
    return role === 'student' ? 'student.html' : 'faculty.html';
}

// Make the logout button work (used on dashboard pages).
function setupLogout() {
    const btn = $('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        try {
            await api.logout();
        } finally {
            window.location.href = 'index.html';
        }
    });
}

// Ask the server who is logged in. If nobody (or the wrong role), go to login.
// This is only for convenience: the real protection is on the backend.
async function requireLogin(allowedRoles) {
    try {
        const data = await api.me();
        const user = data.user;
        if (!allowedRoles.includes(user.role)) {
            window.location.href = dashboardFor(user.role);
            return null;
        }
        return user;
    } catch {
        window.location.href = 'index.html';
        return null;
    }
}

// ---------- Login page ----------

function initLogin() {
    const form = $('loginForm');
    const button = $('submitBtn');

    form.addEventListener('submit', async (event) => {
        event.preventDefault(); // stop the browser from reloading the page
        hideMessage();

        const identifier = $('identifier').value.trim();
        const password = $('password').value;

        if (!identifier || !password) {
            showMessage('Please enter your USN/email and password.');
            return;
        }

        button.disabled = true;
        button.textContent = 'Logging in…';
        try {
            const data = await api.login({ identifier, password });
            window.location.href = dashboardFor(data.user.role);
        } catch (err) {
            showMessage(err.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Login';
        }
    });
}

// ---------- Register page ----------

function initRegister() {
    const form = $('registerForm');
    const button = $('submitBtn');

    // These checks are for convenience only. The server checks everything again.
    function validate(values) {
        if (!values.name || !values.usn || !values.email || !values.password) {
            return 'All fields are required.';
        }
        if (!/^\S+@\S+\.\S+$/.test(values.email)) {
            return 'Please enter a valid email address.';
        }
        if (values.password.length < 8) {
            return 'Password must be at least 8 characters.';
        }
        if (values.password !== values.confirmPassword) {
            return 'Passwords do not match.';
        }
        return '';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideMessage();

        const values = {
            name: $('name').value.trim(),
            usn: $('usn').value.trim().toUpperCase(),
            email: $('email').value.trim().toLowerCase(),
            password: $('password').value,
            confirmPassword: $('confirmPassword').value,
            // No "role" is sent. The server always makes registrants students.
        };

        const problem = validate(values);
        if (problem) {
            showMessage(problem);
            return;
        }

        button.disabled = true;
        button.textContent = 'Creating account…';
        try {
            await api.register(values);
            window.location.href = 'student.html';
        } catch (err) {
            showMessage(err.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Register';
        }
    });
}

// ---------- Student dashboard ----------

async function initStudent() {
    setupLogout();
    const user = await requireLogin(['student']);
    if (!user) return;

    $('navName').textContent = user.name;
    $('studentName').textContent = user.name;
    $('studentUsn').textContent = user.usn;

    showMessage('Loading…', false);
    try {
        const data = await api.studentSummary();
        const subjects = data.subjects || [];

        if (subjects.length === 0) {
            showMessage('You are not enrolled in any subjects yet.', false);
            return;
        }

        hideMessage();
        const tbody = $('subjectsBody');
        tbody.innerHTML = ''; // clear old rows (safe: we insert no user data here)

        subjects.forEach((s) => {
            const row = document.createElement('tr');
            const cells = [s.name, s.code, s.total, s.present, s.absent];

            cells.forEach((value) => {
                const td = document.createElement('td');
                td.textContent = value;
                row.appendChild(td);
            });

            const pctCell = document.createElement('td');
            const pill = document.createElement('span');
            pill.className = s.percentage >= 75 ? 'pill ok' : 'pill low';
            pill.textContent = s.percentage + '%';
            pctCell.appendChild(pill);
            row.appendChild(pctCell);

            tbody.appendChild(row);
        });

        $('subjectsTable').classList.remove('hidden');
    } catch (err) {
        showMessage(err.message);
    }
}

// ---------- Faculty dashboard ----------

async function initFaculty() {
    setupLogout();
    const user = await requireLogin(['faculty', 'admin']);
    if (!user) return;

    $('navName').textContent = user.name;
    $('navRole').textContent = user.role;
    $('facultyName').textContent = user.name;

    showMessage('Loading…', false);
    try {
        const data = await api.mySubjects();
        const subjects = data.subjects || [];

        if (subjects.length === 0) {
            showMessage('No subjects assigned yet.', false);
            return;
        }

        hideMessage();
        const grid = $('subjectsGrid');
        grid.innerHTML = '';

        subjects.forEach((s) => {
            const card = document.createElement('article');
            card.className = 'card';

            const title = document.createElement('h3');
            title.textContent = s.name;

            const details = document.createElement('p');
            details.textContent = s.code + ' · ' + s.semester + ' · ' + s.academicYear;

            const openBtn = document.createElement('button');
            openBtn.className = 'btn btn-secondary';
            openBtn.disabled = true;
            openBtn.textContent = 'Open (coming soon)';

            card.append(title, details, openBtn);
            grid.appendChild(card);
        });
    } catch (err) {
        showMessage(err.message);
    }
}

// ---------- Start the right code for the current page ----------

const page = document.body.dataset.page;
if (page === 'login') initLogin();
else if (page === 'register') initRegister();
else if (page === 'student') initStudent();
else if (page === 'faculty') initFaculty();