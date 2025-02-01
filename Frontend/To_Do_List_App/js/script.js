document.addEventListener('DOMContentLoaded', function () {
    const taskInput = document.getElementById('taskInput');
    const addButton = document.getElementById('addButton');
    const listSelect = document.getElementById('listSelect');
    const listsWrapper = document.querySelector('.lists-wrapper');
    const newListInput = document.getElementById('newListInput');
    const addListButton = document.getElementById('addListButton');

    let lists = [];
    let draggingItem = null;
    let sourceList = null;

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    function updateRanks(list) {
        const listItems = list.querySelectorAll('li:not(.list-placeholder)');
        listItems.forEach((item, index) => {
            item.setAttribute('data-rank', index + 1);
        });
    }

    function renderLists() {
        listsWrapper.innerHTML = '';
        listSelect.innerHTML = '';

        lists.forEach(list => {
            const listContainer = document.createElement('div');
            listContainer.classList.add('list-container');
            listContainer.dataset.listId = list.id;

            const header = document.createElement('h2');
            header.textContent = list.name;

            const deleteListButton = document.createElement('button');
            deleteListButton.textContent = 'X';
            header.appendChild(deleteListButton);

            deleteListButton.addEventListener('click', function (event) {
                event.stopPropagation();
                deleteList(list.id);
            });

            listContainer.appendChild(header);

            const ul = document.createElement('ul');
            ul.id = list.id;
            ul.classList.add('taskList');
            listContainer.appendChild(ul);
            listsWrapper.appendChild(listContainer);

            const option = document.createElement('option');
            option.value = list.id;
            option.text = list.name;
            listSelect.appendChild(option);

            const listElement = document.getElementById(list.id);
            if (listElement.children.length === 0) {
                addPlaceholder(listElement);
            }

        });

        for (const list of lists) {
            const listElement = document.getElementById(list.id);

            listElement.addEventListener('dragstart', function (event) {
                draggingItem = event.target;
                sourceList = listElement;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/html', draggingItem.outerHTML);
                draggingItem.classList.add('dragging');
            });

             listElement.addEventListener('dragover', function (event) {
				event.preventDefault();
				const target = event.target.closest('li') || event.target.closest('.list-placeholder');
				if (target && target!== draggingItem) {
					const rect = target.getBoundingClientRect();
					const mouseY = event.clientY;
					const middleY = rect.top + rect.height / 2;

					if (mouseY > middleY) {
						listElement.insertBefore(draggingItem, target.nextSibling);
					} else {
						listElement.insertBefore(draggingItem, target);
					}
				}
			});

            listElement.addEventListener('dragend', function () {
                draggingItem.classList.remove('dragging');
                if (sourceList) {
					updateRanks(sourceList)
                    // if the source list became empty after the task was moved, add the placeholder.
                    if (sourceList.children.length === 0) {
                        addPlaceholder(sourceList);
                    }
                    sourceList = null;
                }
                draggingItem = null;
                updateRanks(listElement);
                saveTasks();
            });

            listElement.addEventListener('drop', function (event) {
				event.preventDefault();
                if (draggingItem && (event.target.id === list.id || event.target.classList.contains('list-placeholder'))) {
                    if (event.target.classList.contains('list-placeholder')) {
                        event.target.remove();
                    }
					listElement.appendChild(draggingItem);
					draggingItem.classList.remove('dragging');
					draggingItem = null;
					updateRanks(listElement);
					saveTasks();
                }
            });
        }
    }

    function addPlaceholder(listElement) {
        const placeholder = document.createElement('li');
        placeholder.classList.add('list-placeholder');
        listElement.appendChild(placeholder);
    }

    function removePlaceholder(listElement) {
        const placeholder = listElement.querySelector('.list-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    function loadTasks() {
        let storedLists = localStorage.getItem('lists');
        if (!storedLists) {
            lists = [
                {id: generateId(), name: "High Priority"},
                {id: generateId(), name: "Long Term"},
                {id: generateId(), name: "If Time Permits"}
            ];
            localStorage.setItem('lists', JSON.stringify(lists));
        } else {
            lists = JSON.parse(storedLists);
        }

        renderLists();

        const storedTasks = localStorage.getItem('tasks');
        if (storedTasks) {
            const tasks = JSON.parse(storedTasks);
            for (const listId in tasks) {
                if (document.getElementById(listId)) {
                    tasks[listId].forEach(task => {
                        addTask(task.text, listId, task.completed, task.rank);
                    });
                }
            }
        }
    }

    function saveTasks() {
        const tasks = {};
        for (const list of lists) {
            const listElement = document.getElementById(list.id);
            tasks[list.id] = [];
            const listItems = listElement.querySelectorAll('li:not(.list-placeholder)');
            listItems.forEach(item => {
                let textContent = '';
                for (let i = 0; i < item.childNodes.length; i++) {
                    if (item.childNodes[i].nodeType === Node.TEXT_NODE) {
                        textContent = item.childNodes[i].nodeValue.trim();
                        break;
                    }
                }
                if (textContent !== '') {
                    tasks[list.id].push({
                        text: textContent,
                        completed: item.classList.contains('complete-task'),
                        rank: item.getAttribute('data-rank')
                    });
                }
            });
        }
        localStorage.setItem('tasks', JSON.stringify(tasks));
        localStorage.setItem('lists', JSON.stringify(lists));
    }

    function addTask(taskText, listId, completed = false, rank = null) {
        const listElement = document.getElementById(listId);
		removePlaceholder(listElement);
        const listItem = document.createElement('li');
        listItem.appendChild(document.createTextNode(taskText));
        listItem.setAttribute('draggable', true);

        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('button-container');

        const doneButton = document.createElement('button');
        doneButton.textContent = 'Done';
        doneButton.classList.add('done-btn');
        buttonContainer.appendChild(doneButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.classList.add('delete-btn');
        buttonContainer.appendChild(deleteButton);

        listItem.appendChild(buttonContainer);

        doneButton.addEventListener('click', function (event) {
            event.stopPropagation();
            listItem.classList.toggle('complete-task');
            doneButton.classList.toggle('complete');
            doneButton.textContent = listItem.classList.contains('complete-task') ? 'Complete' : 'Done';
        });

        deleteButton.addEventListener('click', function (event) {
            event.stopPropagation();
            listItem.classList.toggle('complete-task');
            doneButton.classList.toggle('complete');
            doneButton.textContent = listItem.classList.contains('complete-task') ? 'Complete' : 'Done';
        });

        listItem.addEventListener('click', function (event) {
            if (event.target.tagName === 'LI') {
                listItem.classList.toggle('complete-task');
            }
        });

        if (completed) {
            listItem.classList.add('complete-task');
            doneButton.classList.add('complete');
            doneButton.textContent = 'Complete';
        }

        if (rank !== null) {
            listItem.setAttribute('data-rank', rank);
        }

        listElement.appendChild(listItem);
        updateRanks(listElement);
        saveTasks();
    }

    addButton.addEventListener('click', function () {
        const taskText = taskInput.value.trim();
        const selectedList = listSelect.value;
        if (taskText !== '') {
            addTask(taskText, selectedList);
            taskInput.value = '';
        }
    });

    taskInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            addButton.click();
            event.preventDefault();
        }
    });


    function addList() {
        const listName = newListInput.value.trim();
        if (listName) {
            const newList = {
                id: generateId(),
                name: listName
            };
            lists.push(newList);
            renderLists();
            saveTasks();
            newListInput.value = '';
        }
    }

    addListButton.addEventListener('click', addList);

    newListInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            addList();
            event.preventDefault();
        }
    });


    function deleteList(listId) {
        lists = lists.filter(list => list.id !== listId);
        renderLists();
        saveTasks();
    }

    loadTasks();
});