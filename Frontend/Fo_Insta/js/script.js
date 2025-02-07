function likePost(button) {
    button.classList.toggle('liked'); // Toggle the 'liked' class

    if (button.classList.contains('liked')) {
        button.textContent = 'Unlike'; // Change text to "Unlike"
    } else {
        button.textContent = 'Like'; // Change text back to "Like"
    }
}