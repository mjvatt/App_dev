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

    function addTask(taskText) {
        const listItem = document.createElement('li');
        listItem.textContent = taskText;
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
        });


        deleteButton.addEventListener('click', function (event) {
            event.stopPropagation();
            listItem.remove();
            updateRanks();
        });

        listItem.addEventListener('click', function(event) {
            if (event.target.tagName === 'LI') {
                listItem.classList.toggle('complete-task');
            }
        });
       
        taskList.appendChild(listItem);
        updateRanks();
    }

    addButton.addEventListener('click', function () {
        const taskText = taskInput.value.trim();
        if (taskText !== '') {
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
        if (target && target !== draggingItem) {
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
    });

        // Add support for dropping in an empty list
    taskList.addEventListener('drop', function(event) {
        event.preventDefault();
        if (draggingItem && event.target.id === 'taskList') {
            taskList.appendChild(draggingItem);
            draggingItem.classList.remove('dragging');
            draggingItem = null;
            updateRanks();
        }
    });
});