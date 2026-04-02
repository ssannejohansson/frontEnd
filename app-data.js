const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = ["Morning", "Afternoon", "Evening"];
const SHIFT_TIMES = {
    "Morning": "7-15",
    "Afternoon": "15-18",
    "Evening": "18-23"
};
const MAX_STAFF_PER_SHIFT = 3;

const STORAGE_KEYS = {
    store: "scheduleAppStore",
    session: "scheduleAppSession"
};

// Seed data for first load and local development.
const defaultStore = {
    users: [{
            username: "admin",
            password: "1234",
            role: "employer",
            name: "Manager",
            email: "",
            phone: "",
            photo: ""
        },
        {
            username: "eva",
            password: "1234",
            role: "employee",
            name: "Eva",
            email: "eva@sundsgarden.se",
            phone: "070-100 10 10",
            photo: ""
        }
    ],
    employees: [{
            name: "Eva Johansson",
            role: "Waiter",
            email: "eva@sundsgarden.se",
            phone: "070-100 10 10"
        },
        {
            name: "Ali Mamed",
            role: "Chef",
            email: "ali@sundsgarden.se",
            phone: "070-200 20 20"
        },
        {
            name: "Sara Finn",
            role: "Runner",
            email: "sara@sundsgarden.se",
            phone: "070-300 30 30"
        },
        {
            name: "Jonas Berg",
            role: "Bartender",
            email: "jonas@sundsgarden.se",
            phone: "070-400 40 40"
        }
    ],
    availabilityByUser: {
        eva: {
            Morning: {
                Mon: "available",
                Tue: "available",
                Wed: "available",
                Thu: "available",
                Fri: "available",
                Sat: "available",
                Sun: "available"
            },
            Afternoon: {
                Mon: "available",
                Tue: "available",
                Wed: "available",
                Thu: "available",
                Fri: "available",
                Sat: "available",
                Sun: "available"
            },
            Evening: {
                Mon: "maybe",
                Tue: "maybe",
                Wed: "maybe",
                Thu: "maybe",
                Fri: "maybe",
                Sat: "maybe",
                Sun: "maybe"
            }
        }
    },
    jobSchedule: {
        Morning: {
            Mon: ["Eva"],
            Tue: ["Ali"],
            Wed: ["Sara"],
            Thu: ["Jonas"],
            Fri: ["Eva"],
            Sat: ["Ali"],
            Sun: ["Sara"]
        },
        Afternoon: {
            Mon: ["Ali"],
            Tue: ["Eva"],
            Wed: ["Jonas"],
            Thu: ["Sara"],
            Fri: ["Ali"],
            Sat: ["Eva"],
            Sun: ["Jonas"]
        },
        Evening: {
            Mon: ["Jonas"],
            Tue: ["Sara"],
            Wed: ["Ali"],
            Thu: ["Eva"],
            Fri: ["Jonas"],
            Sat: ["Sara"],
            Sun: ["Ali"]
        }
    },
    shiftRequirements: {
        Morning: {
            Mon: 2,
            Tue: 2,
            Wed: 2,
            Thu: 2,
            Fri: 2,
            Sat: 2,
            Sun: 2
        },
        Afternoon: {
            Mon: 2,
            Tue: 2,
            Wed: 2,
            Thu: 2,
            Fri: 2,
            Sat: 2,
            Sun: 2
        },
        Evening: {
            Mon: 2,
            Tue: 2,
            Wed: 2,
            Thu: 2,
            Fri: 2,
            Sat: 2,
            Sun: 2
        }
    },
    shiftExchangeRequests: [],
    scheduleAudit: []
};

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

// Create the store if it does not already exist.
function ensureStore() {
    const existing = localStorage.getItem(STORAGE_KEYS.store);
    if (!existing) {
        localStorage.setItem(STORAGE_KEYS.store, JSON.stringify(defaultStore));
    }
}

// Bring older saved data up to the current shape.
function normalizeStore(store) {
    let changed = false;

    if (!Array.isArray(store.scheduleAudit)) {
        store.scheduleAudit = [];
        changed = true;
    }

    if (!store.availabilityByUser) {
        store.availabilityByUser = {};
        changed = true;
    }

    if (!Array.isArray(store.users)) {
        store.users = deepClone(defaultStore.users);
        changed = true;
    }

    store.users.forEach((user) => {
        if (typeof user.email !== "string") {
            user.email = "";
            changed = true;
        }
        if (typeof user.phone !== "string") {
            user.phone = "";
            changed = true;
        }
        if (typeof user.photo !== "string") {
            user.photo = "";
            changed = true;
        }
    });

    Object.keys(store.availabilityByUser).forEach((userKey) => {
        const availability = store.availabilityByUser[userKey] || {};

        if (availability.Night && !availability.Evening) {
            availability.Evening = availability.Night;
            changed = true;
        }
        if (availability.Night) {
            delete availability.Night;
            changed = true;
        }

        SHIFTS.forEach((shift) => {
            if (!availability[shift]) {
                availability[shift] = createDefaultAvailability()[shift];
                changed = true;
            }

            DAYS.forEach((day) => {
                if (!availability[shift][day]) {
                    availability[shift][day] = "maybe";
                    changed = true;
                }
            });
        });

        store.availabilityByUser[userKey] = availability;
    });

    if (!store.jobSchedule) {
        store.jobSchedule = deepClone(defaultStore.jobSchedule);
        changed = true;
    }

    if (store.jobSchedule.Night && !store.jobSchedule.Evening) {
        store.jobSchedule.Evening = store.jobSchedule.Night;
        changed = true;
    }
    if (store.jobSchedule.Night) {
        delete store.jobSchedule.Night;
        changed = true;
    }

    SHIFTS.forEach((shift) => {
        if (!store.jobSchedule[shift]) {
            store.jobSchedule[shift] = {};
            changed = true;
        }

        DAYS.forEach((day) => {
            const currentValue = store.jobSchedule[shift][day];

            if (Array.isArray(currentValue)) {
                return;
            }

            if (typeof currentValue === "string") {
                if (currentValue.trim() === "" || currentValue === "—") {
                    store.jobSchedule[shift][day] = [];
                } else if (currentValue.includes(",")) {
                    store.jobSchedule[shift][day] = currentValue
                        .split(",")
                        .map((name) => name.trim())
                        .filter((name) => name.length > 0);
                } else {
                    store.jobSchedule[shift][day] = [currentValue];
                }
                changed = true;
                return;
            }

            if (!currentValue) {
                store.jobSchedule[shift][day] = [];
                changed = true;
            }
        });
    });

    if (!store.shiftRequirements) {
        store.shiftRequirements = {
            Morning: {},
            Afternoon: {},
            Evening: {}
        };
        changed = true;
    }

    SHIFTS.forEach((shift) => {
        if (!store.shiftRequirements[shift]) {
            store.shiftRequirements[shift] = {};
            changed = true;
        }

        DAYS.forEach((day) => {
            const assignedCount = toAssignmentArray(store.jobSchedule[shift][day]).length;
            const currentValue = Number(store.shiftRequirements[shift][day]);
            const baseValue = Number.isFinite(currentValue) ? currentValue : 2;
            const normalizedValue = Math.max(assignedCount, Math.min(MAX_STAFF_PER_SHIFT, Math.max(1, Math.round(baseValue))));

            if (store.shiftRequirements[shift][day] !== normalizedValue) {
                store.shiftRequirements[shift][day] = normalizedValue;
                changed = true;
            }
        });
    });

    if (!Array.isArray(store.shiftExchangeRequests)) {
        store.shiftExchangeRequests = [];
        changed = true;
    }

    store.shiftExchangeRequests = store.shiftExchangeRequests
        .filter((request) => request && request.id && request.shift && request.day && request.fromName && request.toName)
        .map((request) => ({
            ...request,
            status: request.status || "pending"
        }));

    return changed;
}

// Add shift times to a label when available.
function formatShiftLabel(shift) {
    const time = SHIFT_TIMES[shift];
    return time ? `${shift} (${time})` : shift;
}

// Make sure schedule cells always use an array.
function toAssignmentArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (!value || value === "—") {
        return [];
    }
    return [value];
}

// Look up the role for a named employee.
function getEmployeeRoleByName(store, employeeName) {
    const employee = (store.employees || []).find((entry) => entry.name === employeeName);
    return employee ? employee.role : "Unknown";
}

// Look up a saved user account by username.
function getUserByUsername(store, username) {
    return (store.users || []).find((user) => user.username === username) || null;
}

// Update a saved user account in place.
function updateUserProfile(store, username, updates) {
    const user = getUserByUsername(store, username);
    if (!user) {
        return null;
    }

    Object.assign(user, updates);
    saveStore(store);
    return user;
}

// Rename every scheduled assignment for one staff member.
function renameScheduledEmployee(store, oldName, newName) {
    if (oldName === newName) {
        return false;
    }

    let changed = false;

    SHIFTS.forEach((shift) => {
        DAYS.forEach((day) => {
            const assignments = toAssignmentArray(store.jobSchedule[shift][day]);
            const updatedAssignments = assignments.map((name) => (name === oldName ? newName : name));

            if (JSON.stringify(assignments) !== JSON.stringify(updatedAssignments)) {
                store.jobSchedule[shift][day] = updatedAssignments;
                changed = true;
            }
        });
    });

    if (changed) {
        saveStore(store);
    }

    return changed;
}

// Get required staff count for one shift cell.
function getRequiredSlotsForShift(store, shift, day) {
    const assignedCount = toAssignmentArray(store.jobSchedule[shift][day]).length;
    const required = Number(store.shiftRequirements?.[shift]?.[day]);
    const normalized = Number.isFinite(required) ? required : 2;
    return Math.max(assignedCount, Math.min(MAX_STAFF_PER_SHIFT, Math.max(1, Math.round(normalized))));
}

// Set required staff count for one shift cell.
function setRequiredSlotsForShift(store, shift, day, nextRequiredCount) {
    if (!store.shiftRequirements) {
        store.shiftRequirements = {};
    }
    if (!store.shiftRequirements[shift]) {
        store.shiftRequirements[shift] = {};
    }

    const assignedCount = toAssignmentArray(store.jobSchedule[shift][day]).length;
    const clamped = Math.max(assignedCount, Math.min(MAX_STAFF_PER_SHIFT, Math.max(1, Math.round(Number(nextRequiredCount) || 1))));
    store.shiftRequirements[shift][day] = clamped;
    saveStore(store);
    return clamped;
}

// Count open signup slots for one shift cell.
function getOpenSlotsForShift(store, shift, day) {
    const required = getRequiredSlotsForShift(store, shift, day);
    const assigned = toAssignmentArray(store.jobSchedule[shift][day]).length;
    return Math.max(0, required - assigned);
}

// Check if a shift still has room for another person.
function canAssignEmployeeToShift(store, shift, day, employeeName) {
    const existing = toAssignmentArray(store.jobSchedule[shift][day]);
    if (existing.includes(employeeName)) {
        return {
            ok: false,
            reason: `${employeeName} is already assigned to ${formatShiftLabel(shift)} on ${day}.`
        };
    }
    const required = getRequiredSlotsForShift(store, shift, day);
    if (existing.length >= required) {
        return {
            ok: false,
            reason: `No open slots left for ${formatShiftLabel(shift)} on ${day}.`
        };
    }
    if (existing.length >= MAX_STAFF_PER_SHIFT) {
        return {
            ok: false,
            reason: `Maximum ${MAX_STAFF_PER_SHIFT} staff are allowed for ${formatShiftLabel(shift)} on ${day}.`
        };
    }
    return {
        ok: true,
        reason: ""
    };
}

// Create a request to hand over one shift to a colleague.
function createShiftExchangeRequest(store, payload) {
    const fromName = (payload.fromName || "").trim();
    const toName = (payload.toName || "").trim();
    const shift = payload.shift;
    const day = payload.day;

    if (!fromName || !toName || !shift || !day) {
        return {
            ok: false,
            reason: "Missing shift request details."
        };
    }

    if (fromName === toName) {
        return {
            ok: false,
            reason: "Choose a different colleague for shift handover."
        };
    }

    const assigned = toAssignmentArray(store.jobSchedule[shift][day]);
    if (!assigned.includes(fromName)) {
        return {
            ok: false,
            reason: `${fromName} is not assigned to this shift.`
        };
    }
    if (assigned.includes(toName)) {
        return {
            ok: false,
            reason: `${toName} is already assigned to this shift.`
        };
    }

    const duplicatePending = (store.shiftExchangeRequests || []).some((request) =>
        request.status === "pending" &&
        request.shift === shift &&
        request.day === day &&
        request.fromName === fromName &&
        request.toName === toName
    );
    if (duplicatePending) {
        return {
            ok: false,
            reason: "A similar pending request already exists."
        };
    }

    const request = {
        id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shift,
        day,
        fromName,
        toName,
        note: (payload.note || "").trim(),
        status: "pending",
        createdAt: new Date().toISOString()
    };

    store.shiftExchangeRequests.unshift(request);
    saveStore(store);
    return {
        ok: true,
        request
    };
}

// Approve or reject a pending shift handover request.
function setShiftExchangeRequestStatus(store, requestId, status, reviewedBy) {
    const request = (store.shiftExchangeRequests || []).find((entry) => entry.id === requestId);
    if (!request) {
        return {
            ok: false,
            reason: "Shift request was not found."
        };
    }

    if (request.status !== "pending") {
        return {
            ok: false,
            reason: "This request has already been handled."
        };
    }

    if (status !== "approved" && status !== "rejected") {
        return {
            ok: false,
            reason: "Invalid request status."
        };
    }

    if (status === "approved") {
        const currentAssignments = toAssignmentArray(store.jobSchedule[request.shift][request.day]);
        if (!currentAssignments.includes(request.fromName)) {
            return {
                ok: false,
                reason: `${request.fromName} is no longer assigned to this shift.`
            };
        }
        if (currentAssignments.includes(request.toName)) {
            return {
                ok: false,
                reason: `${request.toName} is already assigned to this shift.`
            };
        }

        store.jobSchedule[request.shift][request.day] = currentAssignments.map((name) =>
            name === request.fromName ? request.toName : name
        );
    }

    request.status = status;
    request.reviewedBy = reviewedBy || "";
    request.reviewedAt = new Date().toISOString();
    saveStore(store);

    return {
        ok: true,
        request
    };
}

// Store the latest schedule action for the activity feed.
function appendScheduleAudit(store, entry) {
    if (!Array.isArray(store.scheduleAudit)) {
        store.scheduleAudit = [];
    }

    store.scheduleAudit.unshift({
        timestamp: new Date().toISOString(),
        ...entry
    });

    if (store.scheduleAudit.length > 500) {
        store.scheduleAudit = store.scheduleAudit.slice(0, 500);
    }
}

// Load the app state from localStorage.
function getStore() {
    ensureStore();
    const store = JSON.parse(localStorage.getItem(STORAGE_KEYS.store));
    const changed = normalizeStore(store);
    if (changed) {
        saveStore(store);
    }
    return store;
}

function saveStore(store) {
    localStorage.setItem(STORAGE_KEYS.store, JSON.stringify(store));
}

// Build a default availability grid.
function createDefaultAvailability() {
    return {
        Morning: DAYS.reduce((acc, day) => ({
            ...acc,
            [day]: "available"
        }), {}),
        Afternoon: DAYS.reduce((acc, day) => ({
            ...acc,
            [day]: "available"
        }), {}),
        Evening: DAYS.reduce((acc, day) => ({
            ...acc,
            [day]: "maybe"
        }), {})
    };
}

// Read availability for one user and create defaults when needed.
function getAvailabilityForUser(store, username) {
    if (!store.availabilityByUser[username]) {
        store.availabilityByUser[username] = createDefaultAvailability();
        saveStore(store);
    }
    return deepClone(store.availabilityByUser[username]);
}

// Persist updated availability for one user.
function setAvailabilityForUser(store, username, availability) {
    store.availabilityByUser[username] = deepClone(availability);
    saveStore(store);
}

// Save the current session user.
function setCurrentUser(user) {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
        username: user.username,
        role: user.role,
        name: user.name
    }));
}

// Read the current session user.
function getCurrentUser() {
    const session = localStorage.getItem(STORAGE_KEYS.session);
    if (!session) {
        return null;
    }
    return JSON.parse(session);
}

// Clear the current session user.
function clearCurrentUser() {
    localStorage.removeItem(STORAGE_KEYS.session);
}

// Redirect away if the role does not match.
function requireRole(expectedRole) {
    const user = getCurrentUser();
    if (!user || user.role !== expectedRole) {
        window.location.href = "index.html";
        return null;
    }
    return user;
}