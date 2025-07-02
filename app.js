// Initialize database
let db;
const dbName = 'EmployeeDirectoryDB';
const dbVersion = 1;

const request = indexedDB.open(dbName, dbVersion);

request.onupgradeneeded = (event) => {
    db = event.target.result;
    
    // Create object stores (tables) if they don't exist
    if (!db.objectStoreNames.contains('people')) {
        const peopleStore = db.createObjectStore('people', { keyPath: 'id', autoIncrement: true });
        peopleStore.createIndex('department', 'department', { unique: false });
    }
    
    if (!db.objectStoreNames.contains('departments')) {
        const departmentsStore = db.createObjectStore('departments', { keyPath: 'id', autoIncrement: true });
        departmentsStore.createIndex('name', 'name', { unique: true });
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
    // Initial rendering
    renderPeople();
    setupDepartmentSelection();
    loadDepartments();
};

request.onerror = (event) => {
    console.error('Database error:', event.target.error);
};

// UI Elements
const addPersonBtn = document.getElementById('addPersonBtn');
const manageDepartmentsBtn = document.getElementById('manageDepartmentsBtn');
const personModal = document.getElementById('personModal');
const departmentsModal = document.getElementById('departmentsModal');
const personForm = document.getElementById('personForm');
const departmentForm = document.getElementById('departmentForm');

// Modal open/close
function openModal(modal) {
    modal.style.display = 'block';
}

function closeModal(modal) {
    modal.style.display = 'none';
}

document.querySelectorAll('.close').forEach(span => {
    span.onclick = () => {
        if (personModal.style.display === 'block') closeModal(personModal);
        if (departmentsModal.style.display === 'block') closeModal(departmentsModal);
    };
});

window.onclick = (event) => {
    if (event.target === personModal) closeModal(personModal);
    if (event.target === departmentsModal) closeModal(departmentsModal);
};

// Event listeners
addPersonBtn.addEventListener('click', () => {
    document.getElementById('personModalTitle').textContent = 'Add Person';
    personForm.reset();
    document.getElementById('personId').value = '';
    openModal(personModal);
});

manageDepartmentsBtn.addEventListener('click', () => {
    openModal(departmentsModal);
});

// Form submissions
personForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('personId').value;
    const name = document.getElementById('name').value;
    const role = document.getElementById('role').value;
    const description = document.getElementById('description').value;
    const image = document.getElementById('image').value;
    const department = document.getElementById('department').value;
    
    const personData = {
        name,
        role,
        description,
        department,
        image: image || 'https://via.placeholder.com/300x200?text=No+Image'
    };
    
    if (id) {
        updatePerson(parseInt(id), personData);
    } else {
        addPerson(personData);
    }
    
    closeModal(personModal);
});

departmentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('departmentName').value;
    if (!name) return;
    
    addDepartment(name);
    document.getElementById('departmentName').value = '';
});

// CRUD: People
function addPerson(person) {
    const transaction = db.transaction(['people'], 'readwrite');
    const store = transaction.objectStore('people');
    const request = store.add(person);
    
    request.onsuccess = () => {
        renderPeople();
    };
}

function updatePerson(id, person) {
    const transaction = db.transaction(['people'], 'readwrite');
    const store = transaction.objectStore('people');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
        const data = getRequest.result;
        const updateData = { ...data, ...person };
        store.put(updateData);
        renderPeople();
    };
}

function deletePerson(id) {
    const transaction = db.transaction(['people'], 'readwrite');
    const store = transaction.objectStore('people');
    store.delete(id);
    renderPeople();
}

// CRUD: Departments
function addDepartment(name) {
    const transaction = db.transaction(['departments'], 'readwrite');
    const store = transaction.objectStore('departments');
    const index = store.index('name');
    
    // Check if department already exists
    const request = index.get(name);
    request.onsuccess = () => {
        if (!request.result) {
            const department = { name };
            store.add(department).onsuccess = () => {
                loadDepartments();
                setupDepartmentSelection();
            };
        }
    };
}

function deleteDepartment(id) {
    const transaction = db.transaction(['departments'], 'readwrite');
    const store = transaction.objectStore('departments');
    store.delete(id);
    loadDepartments();
    setupDepartmentSelection();
}

// Rendering
function renderPeople() {
    const peopleList = document.getElementById('peopleList');
    peopleList.innerHTML = '';
    
    const transaction = db.transaction(['people'], 'readonly');
    const store = transaction.objectStore('people');
    const cursorRequest = store.openCursor();
    
    cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const person = cursor.value;
            const department = person.department ? person.department : 'No Department';
            
            const personCard = document.createElement('div');
            personCard.className = 'person-card';
            personCard.innerHTML = `
                <img src="${person.image}" alt="${person.name}" class="person-image">
                <div class="person-info">
                    <h3 class="person-name">${person.name}</h3>
                    <div class="person-role">${person.role}</div>
                    <span class="person-department">${department}</span>
                    <p class="person-description">${person.description}</p>
                    <div class="person-actions">
                        <button class="btn-edit" onclick="openEditModal(${cursor.primaryKey})">Edit</button>
                        <button class="btn-delete" onclick="deletePerson(${cursor.primaryKey})">Delete</button>
                    </div>
                </div>
            `;
            
            peopleList.appendChild(personCard);
            cursor.continue();
        }
    };
}

function loadDepartments() {
    const departmentList = document.getElementById('departmentList');
    departmentList.innerHTML = '';
    
    const transaction = db.transaction(['departments'], 'readonly');
    const store = transaction.objectStore('departments');
    const cursorRequest = store.openCursor();
    
    cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const department = cursor.value;
            
            const li = document.createElement('li');
            li.className = 'department-item';
            li.innerHTML = `
                <span class="department-name">${department.name}</span>
                <div class="department-actions">
                    <button class="btn-edit" onclick="openEditDepartmentModal(${cursor.primaryKey}, '${department.name}')">Edit</button>
                    <button class="btn-delete" onclick="deleteDepartment(${cursor.primaryKey})">Delete</button>
                </div>
            `;
            
            departmentList.appendChild(li);
            cursor.continue();
        }
    };
}

function setupDepartmentSelection() {
    const select = document.getElementById('department');
    select.innerHTML = '<option value="">Select department</option>';
    
    const transaction = db.transaction(['departments'], 'readonly');
    const store = transaction.objectStore('departments');
    const cursorRequest = store.openCursor();
    
    cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const option = document.createElement('option');
            option.value = cursor.value.name;
            option.textContent = cursor.value.name;
            select.appendChild(option);
            cursor.continue();
        }
    };
}

// Modal openers for edit actions
function openEditModal(id) {
    const transaction = db.transaction(['people'], 'readonly');
    const store = transaction.objectStore('people');
    const request = store.get(id);
    
    request.onsuccess = () => {
        const person = request.result;
        if (person) {
            document.getElementById('personModalTitle').textContent = 'Edit Person';
            document.getElementById('personId').value = id;
            document.getElementById('name').value = person.name;
            document.getElementById('role').value = person.role;
            document.getElementById('description').value = person.description;
            document.getElementById('image').value = person.image || '';
            
            const departmentSelect = document.getElementById('department');
            departmentSelect.value = person.department || '';
            
            openModal(personModal);
        }
    };
}

function openEditDepartmentModal(id, name) {
    const newName = prompt('Enter new department name:', name);
    if (newName && newName.trim() !== '') {
        const transaction = db.transaction(['departments'], 'readwrite');
        const store = transaction.objectStore('departments');
        const getRequest = store.get(id);
        
        getRequest.onsuccess = () => {
            const department = getRequest.result;
            if (department) {
                department.name = newName.trim();
                store.put(department).onsuccess = () => {
                    loadDepartments();
                    setupDepartmentSelection();
                    renderPeople(); // Update people's department display
                };
            }
        };
    }
}

// Expose functions to global scope for inline handlers
window.deletePerson = deletePerson;
window.openEditModal = openEditModal;
window.deleteDepartment = deleteDepartment;
window.openEditDepartmentModal = openEditDepartmentModal;
