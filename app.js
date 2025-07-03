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

// State
let editMode = false;
let currentSearchTerm = '';
let departmentsMap = {};

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
const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const toggleEditModeBtn = document.getElementById('toggleEditModeBtn');
const backupBtn = document.getElementById('backupBtn');
const restoreBtn = document.getElementById('restoreBtn');
const addPersonBtn = document.getElementById('addPersonBtn');
const manageDepartmentsBtn = document.getElementById('manageDepartmentsBtn');
const personModal = document.getElementById('personModal');
const departmentsModal = document.getElementById('departmentsModal');
const personForm = document.getElementById('personForm');
const departmentForm = document.getElementById('departmentForm');

// Initialize button visibility
// addPersonBtn.style.display = 'none';
manageDepartmentsBtn.style.display = 'none';

// Search functionality
searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.toLowerCase();
    searchClearBtn.style.display = currentSearchTerm ? 'block' : 'none';
    renderPeople();
});

searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearchTerm = '';
    searchClearBtn.style.display = 'none';
    renderPeople();
});

// Backup/Restore functionality
backupBtn.addEventListener('click', () => {
    const transaction = db.transaction(['people', 'departments'], 'readonly');
    const backupData = {
        people: [],
        departments: []
    };

    // Export people
    const peopleStore = transaction.objectStore('people');
    peopleStore.openCursor().onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
            backupData.people.push(cursor.value);
            cursor.continue();
        }
    };

    // Export departments
    const deptStore = transaction.objectStore('departments');
    deptStore.openCursor().onsuccess = function(e) {
        const cursor = e.target.result;
        if (cursor) {
            backupData.departments.push(cursor.value);
            cursor.continue();
        }
    };

    transaction.oncomplete = function() {
        const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `db_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
});

restoreBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const backupData = JSON.parse(e.target.result);

            // Reset search to show all employees
            searchInput.value = '';
            currentSearchTerm = '';
            searchClearBtn.style.display = 'none';

            // Clear existing data
            const transaction = db.transaction(['people', 'departments'], 'readwrite');
            const peopleStore = transaction.objectStore('people');
            const deptStore = transaction.objectStore('departments');
            
            peopleStore.clear();
            deptStore.clear();

            transaction.oncomplete = function() {
                // Import people
                const peopleTransaction = db.transaction(['people'], 'readwrite');
                const peopleStore = peopleTransaction.objectStore('people');
                backupData.people.forEach(person => {
                    peopleStore.put(person);
                });

                // Import departments
                const deptTransaction = db.transaction(['departments'], 'readwrite');
                const deptStore = deptTransaction.objectStore('departments');
                backupData.departments.forEach(dept => {
                    deptStore.put(dept);
                });

                // Handle completion of both transactions
                let transactionsCompleted = 0;
                function handleRestoreCompletion() {
                    transactionsCompleted++;
                    if (transactionsCompleted === 2) {
                        loadDepartments();
                        setupDepartmentSelection();
                        renderPeople();
                        alert('Database restored successfully!');
                    }
                }

                peopleTransaction.oncomplete = handleRestoreCompletion;
                deptTransaction.oncomplete = handleRestoreCompletion;
            };
        };
        reader.readAsText(file);
    };
    input.click();
});

// Toggle edit mode
toggleEditModeBtn.addEventListener('click', () => {
    editMode = !editMode;
    toggleEditModeBtn.textContent = editMode ? 'Disable Edit Mode' : 'Enable Edit Mode';
    //addPersonBtn.style.display = editMode ? 'inline-block' : 'none';
    manageDepartmentsBtn.style.display = editMode ? 'inline-block' : 'none';
    renderPeople();
});

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
    document.getElementById('imagePreview').style.display = 'none';
    openModal(personModal);
});

manageDepartmentsBtn.addEventListener('click', () => {
    // Clear the department form on open
    departmentForm.reset();
    openModal(departmentsModal);
});

departmentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('departmentId').value;
    const name = document.getElementById('departmentName').value.trim();
    const description = document.getElementById('departmentDescription').value.trim();
    if (!name) return;

    if (id) {
        updateDepartment(id, name, description);
    } else {
        addDepartment(name, description);
    }

    // Reset form
    departmentForm.reset();
    document.getElementById('departmentSubmitBtn').textContent = 'Add';
});

// Function to resize and convert image to 400x400 with crop and webp/fallback
function resizeAndConvertImage(file, callback) {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // Center crop the image to maintain aspect ratio at 400x400
        const sourceAspectRatio = img.width / img.height;
        const targetAspectRatio = 400 / 400;
        
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = img.width;
        let sourceHeight = img.height;
        
        if (sourceAspectRatio > targetAspectRatio) {
            // Source is wider, crop horizontally
            sourceWidth = img.height * targetAspectRatio;
            sourceX = (img.width - sourceWidth) / 2;
        } else {
            // Source is taller, crop vertically
            sourceHeight = img.width / targetAspectRatio;
            sourceY = (img.height - sourceHeight) / 2;
        }
        
        // Draw the image on canvas with center crop
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 400, 400);
        
        // Try WebP first, then fallback to JPEG with 80% quality
        let dataUrl;
        try {
            dataUrl = canvas.toDataURL('image/webp', 0.8);
        } catch (e) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        }
        
        callback(dataUrl);
    };
    img.src = URL.createObjectURL(file);
}

// Add file input change handler to show image preview and process image
document.getElementById('imageFile').addEventListener('change', function(e) {
    const file = this.files[0];
    const preview = document.getElementById('imagePreview');
    
    if (file) {
        // Temporarily show file name while processing
        preview.alt = 'Processing...';
        preview.style.display = 'block';
        
        resizeAndConvertImage(file, function(resizedImage) {
            preview.src = resizedImage;
            document.getElementById('image').value = resizedImage;
            preview.alt = 'Preview';
        });
    } else {
        preview.style.display = 'none';
    }
});

// Form submissions
personForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('personId').value;
    const name = document.getElementById('name').value;
    const role = document.getElementById('role').value;
    const description = document.getElementById('description').value.trim();
    const image = document.getElementById('image').value; // This is base64 data or existing URL
    const department = document.getElementById('department').value;
    const location = document.getElementById('location').value.trim();
    const imageFile = document.getElementById('imageFile').files[0];
    
    let imageData = image; // default to existing image
    
    // Use the processed image data from the hidden input
    continueSubmission(id, name, role, description, imageData, department);
    
    function continueSubmission(id, name, role, description, imageData, department) {
        const personData = {
            name,
            role,
            description,
            department,
            location: location || '',
            image: imageData || 'https://via.placeholder.com/300x200?text=No+Image'
        };
        
        if (id) {
            updatePerson(parseInt(id), personData);
        } else {
            addPerson(personData);
        }
        
        closeModal(personModal);
    }
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
function addDepartment(name, description) {
    const transaction = db.transaction(['departments'], 'readwrite');
    const store = transaction.objectStore('departments');
    const index = store.index('name');
    
    // Check if department already exists
    const request = index.get(name);
    request.onsuccess = () => {
        if (!request.result) {
            const departmentData = { name, description };
            store.add(departmentData).onsuccess = () => {
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
    
    const departments = {};
    
    cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const person = cursor.value;
            // Skip if doesn't match search
            if (currentSearchTerm && !person.name.toLowerCase().includes(currentSearchTerm)) {
                cursor.continue();
                return;
            }
            const deptName = person.department || 'No Department';
            
            if (!departments[deptName]) {
                departments[deptName] = {
                    employees: [],
                    description: departmentsMap[deptName]?.description || ''
                };
            }
            departments[deptName].employees.push(person);
            cursor.continue();
        } else {
            // After collecting all people, render by department
            Object.keys(departments).sort().forEach(deptName => {
                const dept = departments[deptName];
                
                // Create department header
                const deptHeader = document.createElement('div');
                deptHeader.className = 'department-group';
                deptHeader.innerHTML = `
                    <h2 class="department-header">${deptName}</h2>
                    ${dept.description ? `<p class="department-description">${dept.description}</p>` : ''}
                `;
                peopleList.appendChild(deptHeader);
                
                // Sort employees by name
                dept.employees.sort((a, b) => a.name.localeCompare(b.name)).forEach(person => {
                    const personCard = document.createElement('div');
                    personCard.className = 'person-card';
                    personCard.innerHTML = `
                        <img src="${person.image}" alt="${person.name}" class="person-image">
                        <div class="person-info">
                            <h3 class="person-name">${person.name}</h3>
                            <div class="person-role">${person.role}</div>
                            ${person.location ? `<div class="person-location">📍 ${person.location}</div>` : ''}
                            ${person.description ? `<p class="person-description">${person.description}</p>` : ''}
                            ${editMode ? `
                            <div class="person-actions">
                                <button class="btn-edit" onclick="openEditModal(${person.id})">Edit</button>
                                <button class="btn-delete" onclick="deletePerson(${person.id})">Delete</button>
                            </div>
                            ` : ''}
                        </div>
                    `;
                    peopleList.appendChild(personCard);
                });
            });
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
            
            departmentsMap[department.name] = {
                id: cursor.primaryKey,
                name: department.name,
                description: department.description || ''
            };

            const li = document.createElement('li');
            li.className = 'department-item';
            li.innerHTML = `
                <div class="department-info">
                    <span class="department-name">${department.name}</span>
                    ${department.description ? `<p class="department-description">${department.description}</p>` : ''}
                </div>
                <div class="department-actions">
                    <button class="btn-edit" onclick='openEditDepartmentModal(${cursor.primaryKey}, ${JSON.stringify(department.name)}, ${JSON.stringify(department.description || "")})'>Edit</button>
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
            document.getElementById('location').value = person.location || '';
            // For existing images: we store either base64 data or URL in the hidden field
            document.getElementById('image').value = person.image || '';
            
            // Also set preview for existing image if any
            const preview = document.getElementById('imagePreview');
            if (person.image) {
                preview.src = person.image;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
            
            // Clear the file input on edit so user can re-select
            document.getElementById('imageFile').value = '';
            
            const departmentSelect = document.getElementById('department');
            departmentSelect.value = person.department || '';
            
            openModal(personModal);
        }
    };
}

function openEditDepartmentModal(id, currentName, currentDescription) {
    document.getElementById('departmentId').value = id;
    document.getElementById('departmentName').value = currentName;
    document.getElementById('departmentDescription').value = currentDescription || '';
    document.getElementById('departmentSubmitBtn').textContent = 'Update';
    openModal(departmentsModal);
}

function updateDepartment(id, name, description) {
    const transaction = db.transaction(['departments'], 'readwrite');
    const store = transaction.objectStore('departments');
    const getRequest = store.get(parseInt(id));

    getRequest.onsuccess = () => {
        const department = getRequest.result;
        if (department) {
            department.name = name;
            department.description = description;
            store.put(department).onsuccess = () => {
                loadDepartments();
                setupDepartmentSelection();
                renderPeople(); // Update people's department labels
            };
        }
    };
}

// Expose functions to global scope for inline handlers
window.deletePerson = deletePerson;
window.openEditModal = openEditModal;
window.deleteDepartment = deleteDepartment;
window.openEditDepartmentModal = openEditDepartmentModal;
