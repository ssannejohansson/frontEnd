const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

// Send logged-in users straight to their dashboard.
const activeUser = getCurrentUser();
if (activeUser) {
    window.location.href = activeUser.role === "employer" ? "employer.html" : "employee.html";
}

// Validate the chosen role, username, and password.
loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const store = getStore();
    const formData = new FormData(loginForm);
    const username = formData.get("username").toString().trim().toLowerCase();
    const password = formData.get("password").toString();
    const role = formData.get("role").toString();

    const user = store.users.find(
        (item) => item.username === username && item.password === password && item.role === role
    );

    if (!user) {
        loginError.textContent = "Incorrect login details for selected role.";
        loginError.classList.remove("hidden");
        return;
    }

    setCurrentUser(user);
    window.location.href = user.role === "employer" ? "employer.html" : "employee.html";
});