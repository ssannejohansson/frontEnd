const currentUser = requireRole("employee");

if (currentUser) {
    const logoutBtn = document.getElementById("logoutBtn");
    const profileBtn = document.getElementById("profileBtn");
    const availabilityBtn = document.getElementById("availabilityBtn");
    const myScheduleBtn = document.getElementById("myScheduleBtn");
    const teamAvailabilityBtn = document.getElementById("teamAvailabilityBtn");
    const profileSection = document.getElementById("profileSection");
    const profileForm = document.getElementById("profileForm");
    const profileNameInput = document.getElementById("profileName");
    const profileEmailInput = document.getElementById("profileEmail");
    const profilePhoneInput = document.getElementById("profilePhone");
    const profilePhotoUpload = document.getElementById("profilePhotoUpload");
    const profilePhotoPreview = document.getElementById("profilePhotoPreview");
    const profilePhotoPlaceholder = document.getElementById("profilePhotoPlaceholder");
    const availabilityBody = document.getElementById("availabilityBody");
    const scheduleGrid = document.getElementById("scheduleGrid");
    const staffPool = document.getElementById("staffPool");
    const employeeGreeting = document.getElementById("employeeGreeting");
    const availabilityModal = document.getElementById("availabilityModal");
    const openAvailabilityModalBtn = document.getElementById("openAvailabilityModalBtn");
    const cancelAvailabilityBtn = document.getElementById("cancelAvailabilityBtn");
    const availabilityForm = document.getElementById("availabilityForm");
    const availabilityGrid = document.getElementById("availabilityGrid");
    const employeeShiftRequestsList = document.getElementById("employeeShiftRequestsList");
    const scheduleDayFilter = document.getElementById("scheduleDayFilter");
    const scheduleRoleFilter = document.getElementById("scheduleRoleFilter");
    const compactScheduleBtn = document.getElementById("compactScheduleBtn");
    const undoScheduleBtn = document.getElementById("undoScheduleBtn");
    const shiftGiveawayModal = document.getElementById("shiftGiveawayModal");
    const shiftGiveawaySummary = document.getElementById("shiftGiveawaySummary");
    const shiftGiveawayForm = document.getElementById("shiftGiveawayForm");
    const shiftGiveawayTarget = document.getElementById("shiftGiveawayTarget");
    const shiftGiveawayNote = document.getElementById("shiftGiveawayNote");
    const cancelShiftGiveawayBtn = document.getElementById("cancelShiftGiveawayBtn");
    const saveToast = document.getElementById("saveToast");

    const AVAILABILITY_STATES = ["available", "maybe", "unavailable"];
    let currentAvailabilitySelection = {};
    let selectedProfilePhotoData = null;
    let compactModeEnabled = false;
    let lastScheduleMutation = null;
    let pendingGiveawayShift = null;
    let toastTimer = null;

    // Show short save feedback without interrupting flow.
    function showSaveToast(message) {
        if (!saveToast) {
            return;
        }

        saveToast.textContent = message;
        saveToast.classList.remove("hidden");
        saveToast.classList.add("show");

        if (toastTimer) {
            window.clearTimeout(toastTimer);
        }

        toastTimer = window.setTimeout(() => {
            saveToast.classList.remove("show");
            saveToast.classList.add("hidden");
        }, 2000);
    }

    // Build a simple table cell.
    function createCell(content, className = "") {
        const cell = document.createElement("td");
        cell.textContent = content;
        if (className) {
            cell.classList.add(className);
        }
        return cell;
    }

    // Build a grid cell for the dashboard layout.
    function createGridCell(content = "", className = "", isHeader = false) {
        const cell = document.createElement("div");
        cell.className = `grid-cell ${className}`;
        if (isHeader) {
            cell.className += " header";
        }
        cell.textContent = content;
        return cell;
    }

    // Read drag payloads from the schedule pills.
    function readDragData(event) {
        const raw = event.dataTransfer.getData("application/json");
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    // Keep the undo button in sync with the latest change.
    function updateUndoButtonState() {
        if (undoScheduleBtn) {
            undoScheduleBtn.disabled = !lastScheduleMutation;
        }
    }

    // Rebuild the day and role filters from current data.
    function populateScheduleFilters(store) {
        if (!scheduleDayFilter || !scheduleRoleFilter) {
            return;
        }

        const selectedDay = scheduleDayFilter.value || "all";
        const selectedRole = scheduleRoleFilter.value || "all";

        scheduleDayFilter.innerHTML = "<option value=\"all\">All days</option>";
        DAYS.forEach((day) => {
            const option = document.createElement("option");
            option.value = day;
            option.textContent = day;
            scheduleDayFilter.appendChild(option);
        });

        scheduleRoleFilter.innerHTML = "<option value=\"all\">All roles</option>";
        const uniqueRoles = [...new Set((store.employees || []).map((employee) => employee.role).filter(Boolean))];
        uniqueRoles.forEach((role) => {
            const option = document.createElement("option");
            option.value = role;
            option.textContent = role;
            scheduleRoleFilter.appendChild(option);
        });

        scheduleDayFilter.value = DAYS.includes(selectedDay) ? selectedDay : "all";
        scheduleRoleFilter.value = uniqueRoles.includes(selectedRole) ? selectedRole : "all";
    }

    // Apply the active filters to one schedule cell.
    function filteredAssignmentsForCell(store, day, assignedEmployees) {
        const selectedDay = scheduleDayFilter ? scheduleDayFilter.value : "all";
        const selectedRole = scheduleRoleFilter ? scheduleRoleFilter.value : "all";
        const byDay = selectedDay !== "all" && day !== selectedDay ? [] : assignedEmployees;
        if (selectedRole === "all") {
            return byDay;
        }
        return byDay.filter((name) => getEmployeeRoleByName(store, name) === selectedRole);
    }

    // Save a schedule change and keep it undoable.
    function commitScheduleMutation(store, changes, action, details) {
        if (!changes || changes.length === 0) {
            return;
        }

        changes.forEach((change) => {
            store.jobSchedule[change.shift][change.day] = [...change.next];
        });

        appendScheduleAudit(store, {
            actor: currentUser.username,
            role: currentUser.role,
            action,
            details
        });

        lastScheduleMutation = {
            changes: changes.map((change) => ({
                shift: change.shift,
                day: change.day,
                prev: [...change.prev]
            }))
        };

        saveStore(store);
        updateUndoButtonState();
    }

    // Make a draggable pill for the employee schedule.
    function createDraggableNamePill(name, sourceType, shift = null, day = null, className = "assignment-pill") {
        const pill = document.createElement("span");
        pill.className = className;
        pill.textContent = name;
        pill.draggable = true;

        pill.addEventListener("dragstart", (event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/json", JSON.stringify({
                name,
                sourceType,
                shift,
                day
            }));
        });

        return pill;
    }

    // Allow self-assignment drops from the pool.
    function attachScheduleDropHandlers(cell, shift, day) {
        cell.addEventListener("dragover", (event) => {
            const types = event.dataTransfer && event.dataTransfer.types ? Array.from(event.dataTransfer.types) : [];
            if (!types.includes("application/json") && !types.includes("text/plain")) {
                return;
            }
            event.preventDefault();
            cell.classList.add("drop-active");
        });

        cell.addEventListener("dragleave", () => {
            cell.classList.remove("drop-active");
        });

        cell.addEventListener("drop", (event) => {
            event.preventDefault();
            cell.classList.remove("drop-active");

            const dragData = readDragData(event);
            if (!dragData || dragData.sourceType !== "pool" || dragData.name !== currentUser.name) {
                return;
            }

            const store = getStore();
            const currentTarget = toAssignmentArray(store.jobSchedule[shift][day]);
            const validation = canAssignEmployeeToShift({
                    ...store,
                    jobSchedule: {
                        ...store.jobSchedule,
                        [shift]: {
                            ...store.jobSchedule[shift],
                            [day]: currentTarget
                        }
                    }
                },
                shift,
                day,
                currentUser.name
            );

            if (!validation.ok) {
                window.alert(validation.reason);
                return;
            }

            const targetList = [...currentTarget];
            if (!targetList.includes(currentUser.name)) {
                targetList.push(currentUser.name);
            }
            commitScheduleMutation(
                store,
                [{
                    shift,
                    day,
                    prev: [...currentTarget],
                    next: [...targetList]
                }],
                "self-add-assignment",
                `${currentUser.name} added to ${formatShiftLabel(shift)} ${day}`
            );
            renderPage();
        });
    }

    // Render the self-only staff row.
    function renderStaffPool(store) {
        if (!staffPool) {
            return;
        }

        staffPool.innerHTML = "";
        const meChip = createDraggableNamePill(currentUser.name, "pool", null, null, "staff-pool-pill");
        staffPool.appendChild(meChip);

        staffPool.ondragover = null;
        staffPool.ondragleave = null;
        staffPool.ondrop = null;
    }

    // Render one schedule cell with an optional self-remove action.
    function createScheduleAssignmentCell(store, shift, day, assignedEmployees) {
        const cell = document.createElement("div");
        cell.className = "grid-cell booked multi-assignment-cell";
        attachScheduleDropHandlers(cell, shift, day);

        const namesContainer = document.createElement("div");
        namesContainer.className = "assignment-list";

        if (assignedEmployees.length === 0) {
            const empty = document.createElement("span");
            empty.className = "assignment-empty";
            const openSlots = getOpenSlotsForShift(store, shift, day);
            empty.textContent = openSlots > 0 ? "Drop your name here" : "No open spots";
            namesContainer.appendChild(empty);
        } else {
            const visibleAssignments = assignedEmployees.slice(0, 2);
            const hiddenCount = assignedEmployees.length - visibleAssignments.length;
            cell.title = assignedEmployees.join(", ");

            visibleAssignments.forEach((employeeName) => {
                const pill = document.createElement("span");
                pill.className = "assignment-pill";
                pill.textContent = employeeName;

                // Employee view can only remove their own assignment.
                if (employeeName === currentUser.name) {
                    const removeBtn = document.createElement("button");
                    removeBtn.type = "button";
                    removeBtn.className = "assignment-remove-btn";
                    removeBtn.setAttribute("aria-label", `Remove yourself from ${formatShiftLabel(shift)} on ${day}`);
                    removeBtn.textContent = "x";
                    removeBtn.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        const store = getStore();
                        const current = toAssignmentArray(store.jobSchedule[shift][day]);
                        commitScheduleMutation(
                            store,
                            [{
                                shift,
                                day,
                                prev: [...current],
                                next: current.filter((name) => name !== currentUser.name)
                            }],
                            "self-remove-assignment",
                            `${currentUser.name} removed from ${formatShiftLabel(shift)} ${day}`
                        );
                        renderPage();
                    });

                    const giveawayBtn = document.createElement("button");
                    giveawayBtn.type = "button";
                    giveawayBtn.className = "assignment-giveaway-btn";
                    giveawayBtn.textContent = "Give";
                    giveawayBtn.setAttribute("aria-label", `Give away ${formatShiftLabel(shift)} on ${day}`);
                    giveawayBtn.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openShiftGiveawayModal(shift, day);
                    });

                    pill.appendChild(removeBtn);
                    pill.appendChild(giveawayBtn);
                }

                namesContainer.appendChild(pill);
            });

            if (hiddenCount > 0) {
                const more = document.createElement("span");
                more.className = "assignment-more";
                more.textContent = `+${hiddenCount} more`;
                namesContainer.appendChild(more);
            }
        }

        cell.appendChild(namesContainer);
        return cell;
    }

    // Render the saved availability table.
    function renderAvailability(availability) {
        availabilityBody.innerHTML = "";

        SHIFTS.forEach((shift) => {
            const row = document.createElement("tr");
            row.appendChild(createCell(formatShiftLabel(shift)));

            DAYS.forEach((day) => {
                const value = availability[shift][day];
                row.appendChild(createCell(value, `cell-${value}`));
            });

            availabilityBody.appendChild(row);
        });
    }

    // Draw the main schedule grid.
    function renderScheduleGrid(store) {
        scheduleGrid.innerHTML = "";

        scheduleGrid.style.gridTemplateColumns = `180px repeat(${DAYS.length}, 220px)`;

        const headerRow = [];
        headerRow.push(createGridCell("Shift", "", true));
        DAYS.forEach((day) => {
            headerRow.push(createGridCell(day, "", true));
        });
        headerRow.forEach((cell) => scheduleGrid.appendChild(cell));

        SHIFTS.forEach((shift) => {
            scheduleGrid.appendChild(createGridCell(formatShiftLabel(shift), "shift-label"));

            DAYS.forEach((day) => {
                const assigned = store.jobSchedule[shift][day] || [];
                const assignedEmployees = filteredAssignmentsForCell(store, day, toAssignmentArray(assigned));
                scheduleGrid.appendChild(createScheduleAssignmentCell(store, shift, day, assignedEmployees));
            });
        });

        if (compactModeEnabled) {
            scheduleGrid.classList.add("compact-mode");
        }
    }

    // Build the availability picker grid.
    function buildAvailabilityGrid() {
        availabilityGrid.innerHTML = "";

        const gridContainer = document.createElement("div");
        gridContainer.className = "availability-grid-wrapper";

        const headerRow = document.createElement("div");
        headerRow.className = "availability-grid-row";

        const emptyCell = document.createElement("div");
        emptyCell.className = "availability-grid-cell header";
        emptyCell.textContent = "Shift";
        headerRow.appendChild(emptyCell);

        DAYS.forEach(day => {
            const cell = document.createElement("div");
            cell.className = "availability-grid-cell header";
            cell.textContent = day;
            headerRow.appendChild(cell);
        });
        gridContainer.appendChild(headerRow);

        SHIFTS.forEach(shift => {
            const row = document.createElement("div");
            row.className = "availability-grid-row";

            const shiftLabel = document.createElement("div");
            shiftLabel.className = "availability-grid-cell shift-label";
            shiftLabel.textContent = formatShiftLabel(shift);
            row.appendChild(shiftLabel);

            DAYS.forEach(day => {
                const cell = document.createElement("button");
                cell.type = "button";
                cell.className = "availability-grid-cell";
                const key = `${shift}-${day}`;
                const status = currentAvailabilitySelection[key] || "available";
                cell.classList.add(status);
                cell.textContent = status.charAt(0).toUpperCase();

                cell.addEventListener("click", (e) => {
                    e.preventDefault();
                    cycleAvailability(cell, key);
                });

                row.appendChild(cell);
            });

            gridContainer.appendChild(row);
        });

        availabilityGrid.appendChild(gridContainer);
    }

    // Cycle one availability cell through its states.
    function cycleAvailability(cell, key) {
        const currentStatus = currentAvailabilitySelection[key] || "available";
        const currentIndex = AVAILABILITY_STATES.indexOf(currentStatus);
        const nextIndex = (currentIndex + 1) % AVAILABILITY_STATES.length;
        const nextStatus = AVAILABILITY_STATES[nextIndex];

        currentAvailabilitySelection[key] = nextStatus;

        // Update cell appearance
        cell.className = "availability-grid-cell " + nextStatus;
        cell.textContent = nextStatus.charAt(0).toUpperCase();
    }

    // Load the logged-in user's profile into the form.
    function loadProfileFormFromStore() {
        const store = getStore();
        const profile = getUserByUsername(store, currentUser.username) || currentUser;

        if (profileNameInput) {
            profileNameInput.value = profile.name || "";
        }
        if (profileEmailInput) {
            profileEmailInput.value = profile.email || "";
        }
        if (profilePhoneInput) {
            profilePhoneInput.value = profile.phone || "";
        }

        selectedProfilePhotoData = profile.photo || "";
        if (profilePhotoPreview && profilePhotoPlaceholder) {
            if (selectedProfilePhotoData) {
                profilePhotoPreview.src = selectedProfilePhotoData;
                profilePhotoPreview.classList.remove("hidden");
                profilePhotoPlaceholder.classList.add("hidden");
            } else {
                profilePhotoPreview.classList.add("hidden");
                profilePhotoPlaceholder.classList.remove("hidden");
            }
        }
    }

    // Load the modal form from the saved availability.
    function loadFormFromStore() {
        const store = getStore();
        const availability = getAvailabilityForUser(store, currentUser.username);

        currentAvailabilitySelection = {};
        SHIFTS.forEach(shift => {
            DAYS.forEach(day => {
                const key = `${shift}-${day}`;
                currentAvailabilitySelection[key] = availability[shift][day];
            });
        });

        buildAvailabilityGrid();
    }

    // Summarize team availability by day.
    function renderTeamAvailability(store) {
        const teamAvailabilityGrid = document.getElementById("teamAvailabilityGrid");
        teamAvailabilityGrid.innerHTML = "";
        teamAvailabilityGrid.className = "team-availability-grid";

        const headerRow = document.createElement("div");
        headerRow.className = "team-availability-row header-row";

        const emptyCorner = document.createElement("div");
        emptyCorner.className = "team-availability-cell header";
        emptyCorner.textContent = "Employee";
        headerRow.appendChild(emptyCorner);

        DAYS.forEach(day => {
            const dayCell = document.createElement("div");
            dayCell.className = "team-availability-cell header";
            dayCell.textContent = day;
            headerRow.appendChild(dayCell);
        });
        teamAvailabilityGrid.appendChild(headerRow);

        store.employees.forEach(employee => {
            const row = document.createElement("div");
            row.className = "team-availability-row";

            const nameCell = document.createElement("div");
            nameCell.className = "team-availability-cell employee-name";
            nameCell.textContent = employee.name;
            row.appendChild(nameCell);

            const availability = getAvailabilityForUser(store, employee.name.toLowerCase()) || getAvailabilityForUser(store, employee.name);

            DAYS.forEach(day => {
                const cell = document.createElement("div");
                const availableWindows = SHIFTS
                    .filter((shift) => availability[shift][day] === "available")
                    .map((shift) => SHIFT_TIMES[shift]);
                const maybeWindows = SHIFTS
                    .filter((shift) => availability[shift][day] === "maybe")
                    .map((shift) => SHIFT_TIMES[shift]);

                if (availableWindows.length > 0) {
                    cell.className = "team-availability-cell available";
                    cell.textContent = availableWindows.join(", ");
                } else if (maybeWindows.length > 0) {
                    cell.className = "team-availability-cell maybe";
                    cell.textContent = maybeWindows.join(", ");
                } else {
                    cell.className = "team-availability-cell unavailable";
                    cell.textContent = "—";
                }

                row.appendChild(cell);
            });

            teamAvailabilityGrid.appendChild(row);
        });
    }

    // Populate and show the shift give-away modal.
    function openShiftGiveawayModal(shift, day) {
        if (!shiftGiveawayModal || !shiftGiveawayTarget || !shiftGiveawaySummary) {
            return;
        }

        const store = getStore();
        const knownNames = new Set();
        (store.employees || []).forEach((employee) => knownNames.add(employee.name));
        SHIFTS.forEach((s) => {
            DAYS.forEach((d) => {
                toAssignmentArray(store.jobSchedule[s][d]).forEach((name) => knownNames.add(name));
            });
        });

        const colleagues = Array.from(knownNames)
            .filter((name) => name && name !== currentUser.name)
            .sort((a, b) => a.localeCompare(b));

        shiftGiveawayTarget.innerHTML = "";
        colleagues.forEach((name) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            shiftGiveawayTarget.appendChild(option);
        });

        if (colleagues.length === 0) {
            window.alert("No colleague available for shift handover.");
            return;
        }

        pendingGiveawayShift = {
            shift,
            day
        };
        shiftGiveawaySummary.textContent = `${formatShiftLabel(shift)} on ${day}`;
        shiftGiveawayNote.value = "";
        shiftGiveawayModal.classList.remove("hidden");
    }

    // Show current user's handover request history.
    function renderEmployeeShiftRequests(store) {
        if (!employeeShiftRequestsList) {
            return;
        }

        employeeShiftRequestsList.innerHTML = "";
        const myRequests = (store.shiftExchangeRequests || [])
            .filter((request) => request.fromName === currentUser.name || request.toName === currentUser.name)
            .slice(0, 8);

        if (myRequests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "muted schedule-activity-empty";
            empty.textContent = "No handover requests yet.";
            employeeShiftRequestsList.appendChild(empty);
            return;
        }

        myRequests.forEach((request) => {
            const item = document.createElement("article");
            item.className = "shift-request-item";

            const title = document.createElement("strong");
            title.textContent = `${request.fromName} -> ${request.toName}`;

            const details = document.createElement("p");
            details.textContent = `${formatShiftLabel(request.shift)} ${request.day}`;

            const meta = document.createElement("span");
            meta.className = "schedule-activity-meta";
            meta.textContent = `Status: ${request.status}`;

            item.appendChild(title);
            item.appendChild(details);
            item.appendChild(meta);
            employeeShiftRequestsList.appendChild(item);
        });
    }

    // Refresh the profile form and preview.
    function renderProfileSection() {
        loadProfileFormFromStore();
    }

    // Toggle the visible dashboard section.
    function showSection(sectionId) {
        document.querySelectorAll(".section-content").forEach((section) => {
            section.classList.add("hidden");
        });

        document.getElementById(sectionId).classList.remove("hidden");

        document.querySelectorAll(".sidebar-btn").forEach((btn) => {
            btn.classList.remove("active");
        });

        document.querySelector(`[data-section="${sectionId.replace("Section", "")}"]`).classList.add("active");
    }

    // Refresh the whole employee dashboard.
    function renderPage() {
        const store = getStore();
        const availability = getAvailabilityForUser(store, currentUser.username);
        populateScheduleFilters(store);

        renderProfileSection();
        employeeGreeting.textContent = `Hello ${currentUser.name}. Update your weekly availability.`;
        renderAvailability(availability);
        renderScheduleGrid(store);
        renderStaffPool(store);
        renderTeamAvailability(store);
        renderEmployeeShiftRequests(store);
        updateUndoButtonState();
    }

    if (profilePhotoUpload) {
        profilePhotoUpload.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                selectedProfilePhotoData = loadEvent.target.result;
                if (profilePhotoPreview && profilePhotoPlaceholder) {
                    profilePhotoPreview.src = selectedProfilePhotoData;
                    profilePhotoPreview.classList.remove("hidden");
                    profilePhotoPlaceholder.classList.add("hidden");
                }
            };
            reader.readAsDataURL(file);
        });
    }

    if (document.querySelector(".profile-form .photo-upload") && profilePhotoUpload) {
        document.querySelector(".profile-form .photo-upload").addEventListener("click", (event) => {
            if (event.target !== profilePhotoUpload) {
                profilePhotoUpload.click();
            }
        });
    }

    if (profileForm) {
        profileForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const store = getStore();
            const previousProfile = getUserByUsername(store, currentUser.username) || currentUser;
            const oldName = previousProfile.name || currentUser.name;
            const newName = profileNameInput.value.trim();
            const newEmail = profileEmailInput.value.trim();
            const newPhone = profilePhoneInput.value.trim();

            updateUserProfile(store, currentUser.username, {
                name: newName,
                email: newEmail,
                phone: newPhone,
                photo: selectedProfilePhotoData || ""
            });

            renameScheduledEmployee(store, oldName, newName);

            currentUser.name = newName;
            currentUser.email = newEmail;
            currentUser.phone = newPhone;
            currentUser.photo = selectedProfilePhotoData || "";
            setCurrentUser(currentUser);

            renderPage();
            showSection("profileSection");
            showSaveToast("Profile updated");
        });
    }

    openAvailabilityModalBtn.addEventListener("click", () => {
        loadFormFromStore();
        availabilityModal.classList.remove("hidden");
    });

    if (profileBtn) {
        profileBtn.addEventListener("click", () => {
            showSection("profileSection");
        });
    }

    availabilityBtn.addEventListener("click", () => {
        showSection("availabilitySection");
    });

    myScheduleBtn.addEventListener("click", () => {
        showSection("myScheduleSection");
    });

    teamAvailabilityBtn.addEventListener("click", () => {
        showSection("teamAvailabilitySection");
    });

    if (scheduleDayFilter) {
        scheduleDayFilter.addEventListener("change", () => {
            renderPage();
        });
    }

    if (scheduleRoleFilter) {
        scheduleRoleFilter.addEventListener("change", () => {
            renderPage();
        });
    }

    if (compactScheduleBtn) {
        compactScheduleBtn.addEventListener("click", () => {
            compactModeEnabled = !compactModeEnabled;
            compactScheduleBtn.textContent = compactModeEnabled ? "Standard view" : "Compact view";
            renderPage();
        });
    }

    if (undoScheduleBtn) {
        undoScheduleBtn.addEventListener("click", () => {
            if (!lastScheduleMutation) {
                return;
            }

            const store = getStore();
            lastScheduleMutation.changes.forEach((change) => {
                store.jobSchedule[change.shift][change.day] = [...change.prev];
            });

            appendScheduleAudit(store, {
                actor: currentUser.username,
                role: currentUser.role,
                action: "undo-schedule-change",
                details: "Reverted latest personal schedule mutation"
            });

            saveStore(store);
            lastScheduleMutation = null;
            updateUndoButtonState();
            renderPage();
        });
    }

    cancelAvailabilityBtn.addEventListener("click", () => {
        availabilityModal.classList.add("hidden");
    });

    if (cancelShiftGiveawayBtn) {
        cancelShiftGiveawayBtn.addEventListener("click", () => {
            shiftGiveawayModal.classList.add("hidden");
            pendingGiveawayShift = null;
        });
    }

    availabilityModal.addEventListener("click", (e) => {
        if (e.target === availabilityModal) {
            availabilityModal.classList.add("hidden");
        }
    });

    if (shiftGiveawayModal) {
        shiftGiveawayModal.addEventListener("click", (event) => {
            if (event.target === shiftGiveawayModal) {
                shiftGiveawayModal.classList.add("hidden");
                pendingGiveawayShift = null;
            }
        });
    }

    availabilityForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const store = getStore();

        const newAvailability = {
            Morning: {},
            Afternoon: {},
            Evening: {}
        };

        Object.entries(currentAvailabilitySelection).forEach(([key, status]) => {
            const [shift, day] = key.split("-");
            newAvailability[shift][day] = status;
        });

        if (!store.availabilityByUser[currentUser.username]) {
            store.availabilityByUser[currentUser.username] = {};
        }
        store.availabilityByUser[currentUser.username] = newAvailability;

        saveStore(store);
        availabilityModal.classList.add("hidden");
        renderPage();
        showSaveToast("Availability saved");
    });

    if (shiftGiveawayForm) {
        shiftGiveawayForm.addEventListener("submit", (event) => {
            event.preventDefault();

            if (!pendingGiveawayShift) {
                return;
            }

            const store = getStore();
            const result = createShiftExchangeRequest(store, {
                fromName: currentUser.name,
                toName: shiftGiveawayTarget.value,
                shift: pendingGiveawayShift.shift,
                day: pendingGiveawayShift.day,
                note: shiftGiveawayNote.value
            });

            if (!result.ok) {
                window.alert(result.reason);
                return;
            }

            appendScheduleAudit(store, {
                actor: currentUser.username,
                role: currentUser.role,
                action: "request-handover",
                details: `${currentUser.name} requested handover to ${shiftGiveawayTarget.value} for ${formatShiftLabel(pendingGiveawayShift.shift)} ${pendingGiveawayShift.day}`
            });
            saveStore(store);

            shiftGiveawayModal.classList.add("hidden");
            pendingGiveawayShift = null;
            renderPage();
            showSaveToast("Handover request sent");
        });
    }

    logoutBtn.addEventListener("click", () => {
        clearCurrentUser();
        window.location.href = "index.html";
    });

    renderPage();
}