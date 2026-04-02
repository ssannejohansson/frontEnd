const currentUser = requireRole("employer");

if (currentUser) {
    const logoutBtn = document.getElementById("logoutBtn");
    const employeeCards = document.getElementById("employeeCards");
    const registerEmployeeForm = document.getElementById("registerEmployeeForm");
    const listEmployeesBtn = document.getElementById("listEmployeesBtn");
    const registerEmployeeBtn = document.getElementById("registerEmployeeBtn");
    const workScheduleBtn = document.getElementById("workScheduleBtn");
    const teamAvailabilityBtn = document.getElementById("teamAvailabilityBtn");
    const employeeProfileModal = document.getElementById("employeeProfileModal");
    const closeEmployeeProfileBtn = document.getElementById("closeEmployeeProfileBtn");
    const saveEmployeeAvailabilityBtn = document.getElementById("saveEmployeeAvailabilityBtn");
    const employeeProfileContent = document.getElementById("employeeProfileContent");
    const employeeAvailabilityBody = document.getElementById("employeeAvailabilityBody");
    const scheduleGrid = document.getElementById("scheduleGrid");
    const staffPool = document.getElementById("staffPool");
    const scheduleActivityList = document.getElementById("scheduleActivityList");
    const shiftRequestList = document.getElementById("shiftRequestList");
    const scheduleDayFilter = document.getElementById("scheduleDayFilter");
    const scheduleRoleFilter = document.getElementById("scheduleRoleFilter");
    const planningModeBtn = document.getElementById("planningModeBtn");
    const compactScheduleBtn = document.getElementById("compactScheduleBtn");
    const undoScheduleBtn = document.getElementById("undoScheduleBtn");
    const saveToast = document.getElementById("saveToast");

    let editingEmployee = null;
    let employeeAvailabilityEdits = {};
    let selectedPhotoData = null;
    let planningModeEnabled = false;
    let compactModeEnabled = false;
    let lastScheduleMutation = null;
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

    // Build a grid cell for the schedule layout.
    function createGridCell(content = "", className = "", isHeader = false) {
        const cell = document.createElement("div");
        cell.className = `grid-cell ${className}`;
        if (isHeader) {
            cell.className += " header";
        }
        cell.textContent = content;

        return cell;
    }

    // Read drag payloads from schedule pills.
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

    // Keep the undo button in sync with the last change.
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

    // Save a schedule change, add it to history, and enable undo.
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

    // Make a draggable pill for a staff member.
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

    // Allow schedule cells to accept dragged staff assignments.
    function attachScheduleDropHandlers(cell, shift, day) {
        cell.addEventListener("dragover", (event) => {
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
            if (!dragData || !dragData.name) {
                return;
            }

            const store = getStore();
            const changes = [];

            const pushSnapshot = (snapShift, snapDay) => {
                if (!changes.some((entry) => entry.shift === snapShift && entry.day === snapDay)) {
                    changes.push({
                        shift: snapShift,
                        day: snapDay,
                        prev: [...toAssignmentArray(store.jobSchedule[snapShift][snapDay])],
                        next: []
                    });
                }
            };

            if (dragData.sourceType === "cell" && dragData.shift && dragData.day) {
                pushSnapshot(dragData.shift, dragData.day);
            }

            pushSnapshot(shift, day);

            if (dragData.sourceType === "cell" && dragData.shift && dragData.day) {
                const sourceChange = changes.find((entry) => entry.shift === dragData.shift && entry.day === dragData.day);
                sourceChange.next = sourceChange.prev.filter((n) => n !== dragData.name);
            }

            const targetChange = changes.find((entry) => entry.shift === shift && entry.day === day);
            const validation = canAssignEmployeeToShift({
                    ...store,
                    jobSchedule: {
                        ...store.jobSchedule,
                        [shift]: {
                            ...store.jobSchedule[shift],
                            [day]: targetChange.prev
                        }
                    }
                },
                shift,
                day,
                dragData.name
            );

            if (!validation.ok) {
                window.alert(validation.reason);
                return;
            }

            const targetList = toAssignmentArray(store.jobSchedule[shift][day]);
            if (!targetList.includes(dragData.name)) {
                targetList.push(dragData.name);
            }
            targetChange.next = [...targetList];

            commitScheduleMutation(
                store,
                changes,
                dragData.sourceType === "cell" ? "move-assignment" : "add-assignment",
                `${dragData.name} -> ${formatShiftLabel(shift)} ${day}`
            );
            renderPage();
        });
    }

    // Render the draggable staff row.
    function renderStaffPool(store) {
        if (!staffPool) {
            return;
        }

        staffPool.innerHTML = "";

        store.employees.forEach((employee) => {
            const chip = createDraggableNamePill(employee.name, "pool", null, null, "staff-pool-pill");
            staffPool.appendChild(chip);
        });

        staffPool.ondragover = (event) => {
            event.preventDefault();
            staffPool.classList.add("drop-active");
        };

        staffPool.ondragleave = () => {
            staffPool.classList.remove("drop-active");
        };

        staffPool.ondrop = (event) => {
            event.preventDefault();
            staffPool.classList.remove("drop-active");

            const dragData = readDragData(event);
            if (!dragData || dragData.sourceType !== "cell") {
                return;
            }

            const storeData = getStore();
            const sourceList = toAssignmentArray(storeData.jobSchedule[dragData.shift][dragData.day]);
            commitScheduleMutation(
                storeData,
                [{
                    shift: dragData.shift,
                    day: dragData.day,
                    prev: [...sourceList],
                    next: sourceList.filter((n) => n !== dragData.name)
                }],
                "remove-assignment",
                `${dragData.name} removed from ${formatShiftLabel(dragData.shift)} ${dragData.day}`
            );
            renderPage();
        };
    }

    // Render one schedule cell with pills and remove buttons.
    function createScheduleAssignmentCell(store, shift, day, assignedEmployees) {
        const cell = document.createElement("div");
        cell.className = "grid-cell booked multi-assignment-cell";
        attachScheduleDropHandlers(cell, shift, day);

        const namesContainer = document.createElement("div");
        namesContainer.className = "assignment-list";

        const selectedDay = scheduleDayFilter ? scheduleDayFilter.value : "all";
        if (selectedDay !== "all" && day !== selectedDay) {
            cell.classList.add("day-filter-muted");
        }

        if (assignedEmployees.length === 0) {
            const empty = document.createElement("span");
            empty.className = "assignment-empty";
            empty.textContent = "Drop staff here";
            namesContainer.appendChild(empty);
        } else {
            const visibleAssignments = assignedEmployees.slice(0, 2);
            const hiddenCount = assignedEmployees.length - visibleAssignments.length;
            cell.title = assignedEmployees.join(", ");

            visibleAssignments.forEach((employeeName) => {
                const pill = createDraggableNamePill(employeeName, "cell", shift, day, "assignment-pill");

                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "assignment-remove-btn";
                removeBtn.setAttribute("aria-label", `Remove ${employeeName} from ${formatShiftLabel(shift)} on ${day}`);
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
                            next: current.filter((name) => name !== employeeName)
                        }],
                        "remove-assignment",
                        `${employeeName} removed from ${formatShiftLabel(shift)} ${day}`
                    );
                    renderPage();
                });

                pill.appendChild(removeBtn);
                namesContainer.appendChild(pill);
            });

            if (hiddenCount > 0) {
                const more = document.createElement("span");
                more.className = "assignment-more";
                more.textContent = `+${hiddenCount} more`;
                namesContainer.appendChild(more);
            }
        }

        const metaRow = document.createElement("div");
        metaRow.className = "assignment-meta-row";

        const openSlots = getOpenSlotsForShift(store, shift, day);
        const requiredSlots = getRequiredSlotsForShift(store, shift, day);
        const openBadge = document.createElement("span");
        openBadge.className = `open-slot-badge ${openSlots > 0 ? "open" : "closed"}`;
        openBadge.textContent = `Open: ${openSlots}`;

        const controls = document.createElement("div");
        controls.className = "open-slot-controls";

        const minusBtn = document.createElement("button");
        minusBtn.type = "button";
        minusBtn.className = "open-slot-btn";
        minusBtn.textContent = "-";
        minusBtn.setAttribute("aria-label", `Decrease open slots for ${formatShiftLabel(shift)} on ${day}`);
        minusBtn.disabled = requiredSlots <= toAssignmentArray(store.jobSchedule[shift][day]).length;
        minusBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const storeData = getStore();
            const currentRequired = getRequiredSlotsForShift(storeData, shift, day);
            const nextRequired = setRequiredSlotsForShift(storeData, shift, day, currentRequired - 1);
            appendScheduleAudit(storeData, {
                actor: currentUser.username,
                role: currentUser.role,
                action: "set-open-shifts",
                details: `${formatShiftLabel(shift)} ${day} requires ${nextRequired} staff`
            });
            saveStore(storeData);
            renderPage();
        });

        const plusBtn = document.createElement("button");
        plusBtn.type = "button";
        plusBtn.className = "open-slot-btn";
        plusBtn.textContent = "+";
        plusBtn.setAttribute("aria-label", `Increase open slots for ${formatShiftLabel(shift)} on ${day}`);
        plusBtn.disabled = requiredSlots >= MAX_STAFF_PER_SHIFT;
        plusBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const storeData = getStore();
            const currentRequired = getRequiredSlotsForShift(storeData, shift, day);
            const nextRequired = setRequiredSlotsForShift(storeData, shift, day, currentRequired + 1);
            appendScheduleAudit(storeData, {
                actor: currentUser.username,
                role: currentUser.role,
                action: "set-open-shifts",
                details: `${formatShiftLabel(shift)} ${day} requires ${nextRequired} staff`
            });
            saveStore(storeData);
            renderPage();
        });

        controls.appendChild(minusBtn);
        controls.appendChild(plusBtn);
        metaRow.appendChild(openBadge);
        if (planningModeEnabled) {
            metaRow.appendChild(controls);
        }

        cell.appendChild(namesContainer);
        cell.appendChild(metaRow);
        return cell;
    }

    // Draw the main schedule grid.
    function renderScheduleGrid(store) {
        scheduleGrid.innerHTML = "";

        scheduleGrid.style.gridTemplateColumns = `180px repeat(${DAYS.length}, 220px)`;

        // Header row
        const headerRow = [];
        headerRow.push(createGridCell("Shift", "", true));
        DAYS.forEach(day => {
            headerRow.push(createGridCell(day, "", true));
        });
        headerRow.forEach(cell => scheduleGrid.appendChild(cell));

        // Data rows for each shift
        SHIFTS.forEach(shift => {
            // Shift label with time
            scheduleGrid.appendChild(createGridCell(formatShiftLabel(shift), "shift-label"));

            // For each day, show who's scheduled
            DAYS.forEach(day => {
                const assignedEmployees = store.jobSchedule[shift][day] || [];
                const normalized = filteredAssignmentsForCell(store, day, toAssignmentArray(assignedEmployees));
                scheduleGrid.appendChild(createScheduleAssignmentCell(store, shift, day, normalized));
            });
        });

        if (compactModeEnabled) {
            scheduleGrid.classList.add("compact-mode");
        }

        scheduleGrid.classList.toggle("planning-mode", planningModeEnabled);
    }

    // Show one employee's profile and availability.
    function renderEmployeeProfile(store, employee) {
        employeeProfileContent.innerHTML = `
            <div class="employee-profile-info">
                <p><strong>Name:</strong> ${employee.name}</p>
                <p><strong>Email:</strong> ${employee.email}</p>
                <p><strong>Phone:</strong> ${employee.phone}</p>
            </div>
            <div class="form-grid employee-role-grid">
                <label for="employeeRoleInput">Role</label>
                <input id="employeeRoleInput" type="text" value="${employee.role || ""}" />
            </div>
        `;

        employeeAvailabilityBody.innerHTML = "";
        editingEmployee = employee;
        const availability = getAvailabilityForUser(store, employee.name.toLowerCase()) || getAvailabilityForUser(store, employee.name);

        employeeAvailabilityEdits = {};
        if (availability) {
            SHIFTS.forEach(shift => {
                DAYS.forEach(day => {
                    const key = `${shift}-${day}`;
                    employeeAvailabilityEdits[key] = availability[shift][day];
                });
            });
        }

        if (availability) {
            SHIFTS.forEach((shift) => {
                const row = document.createElement("tr");
                row.appendChild(createCell(formatShiftLabel(shift)));

                DAYS.forEach((day) => {
                    const status = employeeAvailabilityEdits[`${shift}-${day}`] || availability[shift][day];
                    const cell = document.createElement("td");
                    cell.className = `cell-${status}`;
                    cell.style.cursor = "pointer";
                    cell.dataset.shift = shift;
                    cell.dataset.day = day;
                    cell.dataset.status = status;
                    cell.textContent = status.charAt(0).toUpperCase();

                    cell.addEventListener("click", () => {
                        const AVAILABILITY_STATES = ["available", "maybe", "unavailable"];
                        const currentStatus = cell.dataset.status;
                        const currentIndex = AVAILABILITY_STATES.indexOf(currentStatus);
                        const nextIndex = (currentIndex + 1) % AVAILABILITY_STATES.length;
                        const nextStatus = AVAILABILITY_STATES[nextIndex];

                        employeeAvailabilityEdits[`${shift}-${day}`] = nextStatus;
                        cell.dataset.status = nextStatus;
                        cell.className = `cell-${nextStatus}`;
                        cell.textContent = nextStatus.charAt(0).toUpperCase();
                    });

                    row.appendChild(cell);
                });

                employeeAvailabilityBody.appendChild(row);
            });
        } else {
            SHIFTS.forEach((shift) => {
                const row = document.createElement("tr");
                row.appendChild(createCell(shift));
                DAYS.forEach((day) => {
                    row.appendChild(createCell("—", ""));
                });
                employeeAvailabilityBody.appendChild(row);
            });
        }
    }

    // Render the employee cards in the list view.
    function renderEmployeeCards(store) {
        employeeCards.innerHTML = "";

        store.employees.forEach((employee) => {
            const card = document.createElement("article");
            card.className = "employee-card";
            card.style.cursor = "pointer";
            const photoElement = employee.photo ?
                `<img src="${employee.photo}" alt="${employee.name}" class="employee-photo">` :
                `<div class="avatar" aria-hidden="true"></div>`;

            card.innerHTML = `
                ${photoElement}
                <h3>${employee.name}</h3>
                <p>${employee.role}</p>
                <p>${employee.email}</p>
            `;
            card.addEventListener("click", () => {
                renderEmployeeProfile(store, employee);
                employeeProfileModal.classList.remove("hidden");
            });
            employeeCards.appendChild(card);
        });
    }

    // Toggle the visible dashboard section.
    function showSection(sectionId) {
        document.querySelectorAll(".section-content").forEach(section => {
            section.classList.add("hidden");
        });

        document.getElementById(sectionId).classList.remove("hidden");

        document.querySelectorAll(".sidebar-btn").forEach(btn => {
            btn.classList.remove("active");
        });
        document.querySelector(`[data-section="${sectionId.replace("Section", "")}"]`).classList.add("active");
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

    // Show the most recent schedule activity items.
    function renderScheduleActivity(store) {
        if (!scheduleActivityList) {
            return;
        }

        scheduleActivityList.innerHTML = "";
        const recentEntries = (store.scheduleAudit || []).slice(0, 6);

        if (recentEntries.length === 0) {
            const emptyState = document.createElement("p");
            emptyState.className = "muted schedule-activity-empty";
            emptyState.textContent = "No recent schedule changes yet.";
            scheduleActivityList.appendChild(emptyState);
            return;
        }

        recentEntries.forEach((entry) => {
            const item = document.createElement("article");
            item.className = "schedule-activity-item";

            const title = document.createElement("strong");
            title.textContent = entry.action.replace(/-/g, " ");

            const details = document.createElement("p");
            details.textContent = entry.details || "Schedule updated.";

            const meta = document.createElement("span");
            meta.className = "schedule-activity-meta";
            const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;
            meta.textContent = `${entry.actor || "unknown"} · ${timestamp ? timestamp.toLocaleString() : ""}`.trim();

            item.appendChild(title);
            item.appendChild(details);
            item.appendChild(meta);
            scheduleActivityList.appendChild(item);
        });
    }

    // Render pending and handled handover requests for employer actions.
    function renderShiftRequests(store) {
        if (!shiftRequestList) {
            return;
        }

        shiftRequestList.innerHTML = "";
        const requests = (store.shiftExchangeRequests || []).slice(0, 8);

        if (requests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "muted schedule-activity-empty";
            empty.textContent = "No handover requests yet.";
            shiftRequestList.appendChild(empty);
            return;
        }

        requests.forEach((request) => {
            const item = document.createElement("article");
            item.className = "shift-request-item";

            const title = document.createElement("strong");
            title.textContent = `${request.fromName} -> ${request.toName}`;

            const details = document.createElement("p");
            details.textContent = `${formatShiftLabel(request.shift)} ${request.day}`;

            const note = document.createElement("p");
            note.className = "shift-request-note";
            note.textContent = request.note ? `Note: ${request.note}` : "No note.";

            const meta = document.createElement("span");
            meta.className = "schedule-activity-meta";
            meta.textContent = `Status: ${request.status}`;

            item.appendChild(title);
            item.appendChild(details);
            item.appendChild(note);
            item.appendChild(meta);

            if (request.status === "pending") {
                const actions = document.createElement("div");
                actions.className = "shift-request-actions";

                const approveBtn = document.createElement("button");
                approveBtn.type = "button";
                approveBtn.className = "btn";
                approveBtn.textContent = "Approve";
                approveBtn.addEventListener("click", () => {
                    const storeData = getStore();
                    const result = setShiftExchangeRequestStatus(storeData, request.id, "approved", currentUser.username);
                    if (!result.ok) {
                        window.alert(result.reason);
                        return;
                    }

                    appendScheduleAudit(storeData, {
                        actor: currentUser.username,
                        role: currentUser.role,
                        action: "approve-handover",
                        details: `${request.fromName} -> ${request.toName} on ${formatShiftLabel(request.shift)} ${request.day}`
                    });
                    saveStore(storeData);
                    showSaveToast("Handover approved");
                    renderPage();
                });

                const rejectBtn = document.createElement("button");
                rejectBtn.type = "button";
                rejectBtn.className = "btn btn-secondary";
                rejectBtn.textContent = "Reject";
                rejectBtn.addEventListener("click", () => {
                    const storeData = getStore();
                    const result = setShiftExchangeRequestStatus(storeData, request.id, "rejected", currentUser.username);
                    if (!result.ok) {
                        window.alert(result.reason);
                        return;
                    }

                    appendScheduleAudit(storeData, {
                        actor: currentUser.username,
                        role: currentUser.role,
                        action: "reject-handover",
                        details: `${request.fromName} -> ${request.toName} on ${formatShiftLabel(request.shift)} ${request.day}`
                    });
                    saveStore(storeData);
                    showSaveToast("Handover rejected");
                    renderPage();
                });

                actions.appendChild(approveBtn);
                actions.appendChild(rejectBtn);
                item.appendChild(actions);
            }

            shiftRequestList.appendChild(item);
        });
    }

    // Refresh the whole employer dashboard.
    function renderPage() {
        const store = getStore();
        if (planningModeBtn) {
            planningModeBtn.textContent = planningModeEnabled ? "Planning mode: On" : "Planning mode: Off";
            planningModeBtn.classList.toggle("is-active", planningModeEnabled);
        }
        populateScheduleFilters(store);
        renderEmployeeCards(store);
        renderScheduleGrid(store);
        renderStaffPool(store);
        renderTeamAvailability(store);
        renderScheduleActivity(store);
        renderShiftRequests(store);
        updateUndoButtonState();
    }

    // Sidebar navigation
    listEmployeesBtn.addEventListener("click", () => {
        showSection("listEmployeesSection");
    });

    registerEmployeeBtn.addEventListener("click", () => {
        showSection("registerEmployeeSection");
    });

    workScheduleBtn.addEventListener("click", () => {
        showSection("workScheduleSection");
    });

    if (teamAvailabilityBtn) {
        teamAvailabilityBtn.addEventListener("click", () => {
            showSection("teamAvailabilitySection");
        });
    }

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

    if (planningModeBtn) {
        planningModeBtn.addEventListener("click", () => {
            planningModeEnabled = !planningModeEnabled;
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
                details: "Reverted latest schedule mutation"
            });

            saveStore(store);
            lastScheduleMutation = null;
            updateUndoButtonState();
            renderPage();
        });
    }

    // Show a preview for the selected employee photo.
    const photoUpload = document.getElementById("photoUpload");
    const photoPreview = document.getElementById("photoPreview");
    const photoPlaceholder = document.getElementById("photoPlaceholder");

    photoUpload.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                selectedPhotoData = e.target.result;
                photoPreview.src = selectedPhotoData;
                photoPreview.classList.remove("hidden");
                photoPlaceholder.classList.add("hidden");
            };
            reader.readAsDataURL(file);
        }
    });

    document.querySelector(".photo-upload").addEventListener("click", (e) => {
        if (e.target !== photoUpload) {
            photoUpload.click();
        }
    });

    registerEmployeeForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(registerEmployeeForm);
        const store = getStore();

        const newEmployee = {
            name: `${formData.get("firstName").toString().trim()} ${formData.get("lastName").toString().trim()}`,
            role: formData.get("newRole").toString().trim(),
            email: formData.get("newEmail").toString().trim(),
            phone: ""
        };

        if (selectedPhotoData) {
            newEmployee.photo = selectedPhotoData;
        }

        store.employees.push(newEmployee);

        saveStore(store);
        registerEmployeeForm.reset();
        photoPreview.classList.add("hidden");
        photoPlaceholder.classList.remove("hidden");
        selectedPhotoData = null;
        renderPage();
        showSection("listEmployeesSection");
        showSaveToast("Employee created");
    });

    closeEmployeeProfileBtn.addEventListener("click", () => {
        employeeProfileModal.classList.add("hidden");
    });

    saveEmployeeAvailabilityBtn.addEventListener("click", () => {
        if (!editingEmployee) return;

        const store = getStore();
        const employeeName = editingEmployee.name.toLowerCase();
        const roleInput = document.getElementById("employeeRoleInput");
        const nextRole = roleInput ? roleInput.value.trim() : editingEmployee.role;
        const previousRole = editingEmployee.role;

        if (!nextRole) {
            window.alert("Please enter a role.");
            return;
        }

        const employeeRecord = (store.employees || []).find((entry) => entry.name === editingEmployee.name);
        if (employeeRecord) {
            employeeRecord.role = nextRole;
        }
        editingEmployee.role = nextRole;

        if (previousRole !== nextRole) {
            appendScheduleAudit(store, {
                actor: currentUser.username,
                role: currentUser.role,
                action: "change-role",
                details: `${editingEmployee.name} role changed from ${previousRole || "unknown"} to ${nextRole}`
            });
        }

        const newAvailability = {
            Morning: {},
            Afternoon: {},
            Evening: {}
        };

        Object.entries(employeeAvailabilityEdits).forEach(([key, status]) => {
            const [shift, day] = key.split("-");
            newAvailability[shift][day] = status;
        });

        setAvailabilityForUser(store, employeeName, newAvailability);
        renderPage();
        employeeProfileModal.classList.add("hidden");
        showSaveToast("Employee changes saved");
    });

    employeeProfileModal.addEventListener("click", (e) => {
        if (e.target === employeeProfileModal) {
            employeeProfileModal.classList.add("hidden");
        }
    });

    logoutBtn.addEventListener("click", () => {
        clearCurrentUser();
        window.location.href = "index.html";
    });

    renderPage();
}