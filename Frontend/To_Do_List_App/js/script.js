document.addEventListener('DOMContentLoaded', function () {
    const taskInput = document.getElementById('taskInput');
    const addButton = document.getElementById('addButton');
    const taskList = document.getElementById('taskList');
    let draggingItem = null;

    function updateRanks() {
        const listItems = taskList.querySelectorAll('li');
        listItems.forEach((item, index) => {
            item.setAttribute('data-rank', index + 1);
        });
    }

    function loadTasks() {
        const storedTasks = localStorage.getItem('tasks');
        if (storedTasks) {
            const tasks = JSON.parse(storedTasks);
            tasks.forEach(task => {
                addTask(task.text, task.completed, task.rank);
            });
        }
    }

	function saveTasks() {
		const tasks = [];
		const listItems = taskList.querySelectorAll('li');
		listItems.forEach(item => {
			// Iterate through child nodes to find the text node
			let textContent = '';
			for (let i = 0; i < item.childNodes.length; i++) {
				if (item.childNodes[i].nodeType === Node.TEXT_NODE) {
					textContent = item.childNodes[i].nodeValue.trim();
					break; // Exit the loop once the text node is found
				}
			}

			// Only add the task if text content is not empty
			if (textContent !== '') {
				tasks.push({
					text: textContent,
					completed: item.classList.contains('complete-task'),
					rank: item.getAttribute('data-rank')
				});
			}
		});
		localStorage.setItem('tasks', JSON.stringify(tasks));
	}

	function addTask(taskText, completed = false, rank = null) {
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

        doneButton.addEventListener('click', function(event){
            event.stopPropagation();
            listItem.classList.toggle('complete-task');
            doneButton.classList.toggle('complete');
            doneButton.textContent = listItem.classList.contains('complete-task')? 'Complete': 'Done';
        });

        deleteButton.addEventListener('click', function (event) {
            event.stopPropagation();
            listItem.remove();
            updateRanks();
            saveTasks();
        });

        listItem.addEventListener('click', function(event) {
            if (event.target.tagName === 'LI') {
                listItem.classList.toggle('complete-task');
            }
        });

		if (completed) {
			listItem.classList.add('complete-task');
			doneButton.classList.add('complete');
			doneButton.textContent = 'Complete';
		}

		if (rank!== null) {
			listItem.setAttribute('data-rank', rank);
		}

		taskList.appendChild(listItem);
		updateRanks();
		saveTasks();
	}
	
    addButton.addEventListener('click', function () {
        const taskText = taskInput.value.trim();
        if (taskText.trim() !== '') {
            addTask(taskText);
            taskInput.value = '';
        }
    });

    taskInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            addButton.click();
            event.preventDefault();
        }
    });

    taskList.addEventListener('dragstart', function (event) {
        draggingItem = event.target;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/html', draggingItem.outerHTML);
        draggingItem.classList.add('dragging');
    });

    taskList.addEventListener('dragover', function (event) {
        event.preventDefault();
        const target = event.target.closest('li');
        if (target && target!== draggingItem) {
            const rect = target.getBoundingClientRect();
            const mouseY = event.clientY;
            const middleY = rect.top + rect.height / 2;

            if (mouseY > middleY) {
                taskList.insertBefore(draggingItem, target.nextSibling);
            } else {
                taskList.insertBefore(draggingItem, target);
            }
        }
    });

    taskList.addEventListener('dragend', function(){
        draggingItem.classList.remove('dragging');
        draggingItem = null;
        updateRanks();
        saveTasks();
    });

    taskList.addEventListener('drop', function(event) {
        event.preventDefault();
        if (draggingItem && event.target.id === 'taskList') {
            taskList.appendChild(draggingItem);
            draggingItem.classList.remove('dragging');
            draggingItem = null;
            updateRanks();
            saveTasks();
        }
    });

    loadTasks();
});