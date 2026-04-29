import { useState, useEffect, useRef, useCallback } from "react";
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

// ─── CAPTURE QUICK-START BEFORE REACT MOUNTS ────────────────────────
// start.html sets 'tt-quick-start' in localStorage before the app loads.
// We read it here, then clear it so it only triggers once.
const _qs = localStorage.getItem('tt-quick-start');
const QUICK_START = _qs !== null && (Date.now() - parseInt(_qs, 10)) < 5000;
if (_qs !== null) localStorage.removeItem('tt-quick-start');

// ─── CONSTANTS ──────────────────────────────────────────────────────
const PROJECT_COLORS = [
  "#4A90D9", "#50C878", "#FF6B6B", "#FFB347", "#9B59B6",
  "#1ABC9C", "#E74C3C", "#3498DB", "#F39C12", "#2ECC71",
  "#E67E22", "#8E44AD", "#16A085", "#D35400", "#C0392B",
];

const TABS = [
  { id: "timer", label: "Timer", icon: "⏱" },
  { id: "history", label: "History", icon: "📋" },
  { id: "projects", label: "Projects", icon: "📁" },
  { id: "reports", label: "Reports", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const ACTIVE_TIMER_LS_KEY = 'tt-active-timer';

// ─── UTILITIES ──────────────────────────────────────────────────────
function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateISO(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── FIRESTORE HELPERS ──────────────────────────────────────────────
function userCol(uid, name) {
  return collection(db, "users", uid, name);
}

function activeTimerDoc(uid) {
  return doc(db, "users", uid, "meta", "activeTimer");
}

function toDateStr(val) {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (val.toDate) return val.toDate().toISOString();
  if (val.seconds) return new Date(val.seconds * 1000).toISOString();
  return new Date(val).toISOString();
}

// Read active timer from localStorage synchronously (used at mount, before React renders)
function readLocalActiveTimer() {
  try {
    const raw = localStorage.getItem(ACTIVE_TIMER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.startTime) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── AUTH SCREEN ────────────────────────────────────────────────────
function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msg = err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
        ? "Invalid email or password"
        : err.code === "auth/email-already-in-use"
        ? "An account with this email already exists"
        : err.code === "auth/weak-password"
        ? "Password must be at least 6 characters"
        : err.code === "auth/invalid-email"
        ? "Please enter a valid email address"
        : "Something went wrong. Please try again.";
      setError(msg);
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    setError("");
    setSuccess("");
    if (!email) {
      setError("Enter your email address first, then tap reset.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("Password reset email sent! Check your inbox.");
    } catch (err) {
      const msg = err.code === "auth/invalid-email"
        ? "Please enter a valid email address"
        : err.code === "auth/user-not-found"
        ? "No account found with that email"
        : "Could not send reset email. Please try again.";
      setError(msg);
    }
  };

  return (
    <div className="app">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div className="app-logo" style={{ width: 64, height: 64, fontSize: 32, margin: "0 auto 16px", borderRadius: 16 }}>⏱</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>TimeTracker</div>
          <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 4 }}>Track your time across projects and tasks</div>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            className="selector"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ marginBottom: 10 }}
            autoComplete="email"
          />
          <input
            className="selector"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ marginBottom: 6 }}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />

          {error && (
            <div style={{
              color: "var(--red)", fontSize: 13, padding: "8px 12px",
              background: "var(--red-glow)", borderRadius: "var(--radius-sm)",
              marginBottom: 10, marginTop: 6,
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              color: "var(--green)", fontSize: 13, padding: "8px 12px",
              background: "var(--green-glow)", borderRadius: "var(--radius-sm)",
              marginBottom: 10, marginTop: 6,
            }}>
              {success}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          >
            {loading ? "..." : isLogin ? "Sign In" : "Create Account"}
          </button>

          {isLogin && (
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <button
                type="button"
                onClick={handleResetPassword}
                style={{
                  background: "none", border: "none", color: "var(--text3)",
                  fontSize: 13, cursor: "pointer", fontFamily: "var(--font)",
                }}
              >
                Forgot password?
              </button>
            </div>
          )}
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); setSuccess(""); }}
            style={{
              background: "none", border: "none", color: "var(--accent)",
              fontSize: 14, cursor: "pointer", fontFamily: "var(--font)",
            }}
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Unregister any existing service worker to prevent PWA install prompts
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(r => r.unregister());
      });
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "var(--text3)" }}>
          <div className="app-logo" style={{ width: 48, height: 48, fontSize: 24, margin: "0 auto 12px", borderRadius: 12 }}>⏱</div>
          Loading...
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <MainApp user={user} />;
}

function MainApp({ user }) {
  const [tab, setTab] = useState("timer");
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // ── Lazy-init timer state from localStorage so first render is correct (no flicker) ──
  const initialTimer = readLocalActiveTimer();

  const [isRunning, setIsRunning] = useState(!!initialTimer);
  const [isPaused, setIsPaused] = useState(initialTimer?.isPaused ?? false);
  const [startTime, setStartTime] = useState(initialTimer?.startTime ?? null);
  const [pausedAt, setPausedAt] = useState(initialTimer?.pausedAt ?? null);
  const [totalPausedMs, setTotalPausedMs] = useState(initialTimer?.totalPausedMs ?? 0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Timer fields. Initialized from localStorage if a timer was already running.
  const [timerProject, setTimerProject] = useState(initialTimer?.projectId ?? "");
  const [timerTask, setTimerTask] = useState(initialTimer?.taskId ?? "");
  const [timerNotes, setTimerNotes] = useState(initialTimer?.notes ?? "");

  // Prevents Firestore snapshot echo (after a local persist) from looping back into state updates
  const skipNextPersist = useRef(false);
  const quickStartHandled = useRef(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [pendingEntry, setPendingEntry] = useState(null);

  // Compute elapsed from timestamps — single source of truth for display
  const computeElapsed = useCallback(() => {
    if (!startTime) return 0;
    const startMs = new Date(startTime).getTime();
    const nowMs = pausedAt ?? Date.now();
    return Math.max(0, Math.floor((nowMs - startMs - totalPausedMs) / 1000));
  }, [startTime, pausedAt, totalPausedMs]);

  // ── Active timer persistence: localStorage (instant, survives tab eviction)
  //    + Firestore (source of truth, syncs across devices) ──
  const persistActiveTimer = useCallback(async (state) => {
    // localStorage first — synchronous, can't fail in a way that blocks us
    try {
      if (state) {
        localStorage.setItem(ACTIVE_TIMER_LS_KEY, JSON.stringify(state));
      } else {
        localStorage.removeItem(ACTIVE_TIMER_LS_KEY);
      }
    } catch (err) {
      console.warn("localStorage write failed:", err);
    }

    // Firestore second — async, may fail offline (that's fine, localStorage has it)
    try {
      if (state) {
        await setDoc(activeTimerDoc(user.uid), state);
      } else {
        await deleteDoc(activeTimerDoc(user.uid));
      }
    } catch (err) {
      console.warn("Firestore activeTimer write failed:", err);
    }
  }, [user.uid]);

  // ── Quick-start: start unassigned timer via /start ──
  useEffect(() => {
    if (!loaded || quickStartHandled.current) return;
    if (QUICK_START && !isRunning) {
      quickStartHandled.current = true;
      const newStart = new Date().toISOString();
      setTimerProject("");
      setTimerTask("");
      setIsRunning(true);
      setIsPaused(false);
      setStartTime(newStart);
      setPausedAt(null);
      setTotalPausedMs(0);
      setElapsed(0);
      setTab("timer");

      skipNextPersist.current = true;
      persistActiveTimer({
        startTime: newStart,
        isPaused: false,
        pausedAt: null,
        totalPausedMs: 0,
        projectId: "",
        taskId: "",
        notes: "",
      });

      // Clear hash so refresh doesn't re-trigger
      window.history.replaceState({}, "", "/");
    } else if (QUICK_START) {
      quickStartHandled.current = true;
      window.history.replaceState({}, "", "/");
    }
  }, [loaded, isRunning, persistActiveTimer]);

  // ── Realtime Firestore listeners ──
  useEffect(() => {
    const uid = user.uid;

    const unsubProjects = onSnapshot(
      query(userCol(uid, "projects")),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProjects(data);
      }
    );

    const unsubTasks = onSnapshot(
      query(userCol(uid, "tasks")),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTasks(data);
      }
    );

    const unsubEntries = onSnapshot(
      query(userCol(uid, "timeEntries"), orderBy("startTime", "desc")),
      (snap) => {
        const data = snap.docs.map(d => {
          const raw = d.data();
          return {
            id: d.id,
            ...raw,
            startTime: toDateStr(raw.startTime),
            endTime: toDateStr(raw.endTime),
          };
        });
        setEntries(data);
        setLoaded(true);
      }
    );

    // Active timer document — keeps phone and laptop in sync
    const unsubActiveTimer = onSnapshot(
      activeTimerDoc(uid),
      (snap) => {
        // If this snapshot is the echo of our own write, ignore it
        if (skipNextPersist.current) {
          skipNextPersist.current = false;
          return;
        }
        if (!snap.exists()) {
          // Remote cleared the timer (e.g., stopped on another device)
          setIsRunning(false);
          setIsPaused(false);
          setStartTime(null);
          setPausedAt(null);
          setTotalPausedMs(0);
          setElapsed(0);
          try { localStorage.removeItem(ACTIVE_TIMER_LS_KEY); } catch {}
          return;
        }
        const data = snap.data();
        setIsRunning(true);
        setIsPaused(data.isPaused ?? false);
        setStartTime(data.startTime ?? null);
        setPausedAt(data.pausedAt ?? null);
        setTotalPausedMs(data.totalPausedMs ?? 0);
        setTimerProject(data.projectId ?? "");
        setTimerTask(data.taskId ?? "");
        setTimerNotes(data.notes ?? "");
        try {
          localStorage.setItem(ACTIVE_TIMER_LS_KEY, JSON.stringify(data));
        } catch {}
      }
    );

    return () => {
      unsubProjects();
      unsubTasks();
      unsubEntries();
      unsubActiveTimer();
    };
  }, [user.uid]);

  // ── Timer tick: derive elapsed from timestamps every second.
  //    Also recompute on visibility change (handles iOS Safari throttling
  //    when the screen turns off or the tab is backgrounded). ──
  useEffect(() => {
    if (!isRunning) {
      clearInterval(timerRef.current);
      return;
    }

    // Recompute immediately so display is correct on resume from background
    setElapsed(computeElapsed());

    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setElapsed(computeElapsed());
      }, 1000);
    }

    const onVisibility = () => {
      if (!document.hidden) setElapsed(computeElapsed());
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [isRunning, isPaused, computeElapsed]);

  // ── Firestore CRUD ──
  const addProject = async (name) => {
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    await addDoc(userCol(user.uid, "projects"), { name, color });
  };

  const deleteProject = async (id) => {
    await deleteDoc(doc(db, "users", user.uid, "projects", id));
    const projTasks = tasks.filter(t => t.projectId === id);
    for (const t of projTasks) {
      await deleteDoc(doc(db, "users", user.uid, "tasks", t.id));
    }
  };

  const addTask = async (projectId, name) => {
    await addDoc(userCol(user.uid, "tasks"), { projectId, name });
  };

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, "users", user.uid, "tasks", id));
  };

  const addEntry = async (entry) => {
    await addDoc(userCol(user.uid, "timeEntries"), entry);
  };

  const updateEntry = async (id, updates) => {
    await updateDoc(doc(db, "users", user.uid, "timeEntries", id), updates);
  };

  const deleteEntry = async (id) => {
    await deleteDoc(doc(db, "users", user.uid, "timeEntries", id));
  };

  // ── Timer handlers ──
  const handleStart = () => {
    if (!timerProject) return;
    const newStart = new Date().toISOString();
    setIsRunning(true);
    setIsPaused(false);
    setStartTime(newStart);
    setPausedAt(null);
    setTotalPausedMs(0);
    setElapsed(0);

    skipNextPersist.current = true;
    persistActiveTimer({
      startTime: newStart,
      isPaused: false,
      pausedAt: null,
      totalPausedMs: 0,
      projectId: timerProject,
      taskId: timerTask,
      notes: timerNotes,
    });
  };

  const handlePause = () => {
    const now = Date.now();
    setIsPaused(true);
    setPausedAt(now);

    skipNextPersist.current = true;
    persistActiveTimer({
      startTime,
      isPaused: true,
      pausedAt: now,
      totalPausedMs,
      projectId: timerProject,
      taskId: timerTask,
      notes: timerNotes,
    });
  };

  const handleResume = () => {
    const newTotal = pausedAt ? totalPausedMs + (Date.now() - pausedAt) : totalPausedMs;
    setTotalPausedMs(newTotal);
    setPausedAt(null);
    setIsPaused(false);

    skipNextPersist.current = true;
    persistActiveTimer({
      startTime,
      isPaused: false,
      pausedAt: null,
      totalPausedMs: newTotal,
      projectId: timerProject,
      taskId: timerTask,
      notes: timerNotes,
    });
  };

  const handleStop = () => {
    const finalPausedMs = pausedAt
      ? totalPausedMs + (Date.now() - pausedAt)
      : totalPausedMs;
    const startMs = new Date(startTime).getTime();
    const endMs = Date.now();
    const finalDuration = Math.max(0, Math.floor((endMs - startMs - finalPausedMs) / 1000));

    const entry = {
      projectId: timerProject,
      taskId: timerTask,
      startTime: startTime,
      endTime: new Date(endMs).toISOString(),
      duration: finalDuration,
      notes: timerNotes,
    };

    // Stop the local clock
    setIsRunning(false);
    setIsPaused(false);
    clearInterval(timerRef.current);

    // Clear the persisted active timer immediately — no matter what comes next,
    // there is no longer a running timer.
    skipNextPersist.current = true;
    persistActiveTimer(null);

    // If no project assigned, show the assign modal (timer state stays around for the modal)
    if (!timerProject) {
      setPendingEntry(entry);
      setShowAssignModal(true);
      return;
    }

    // Otherwise save directly and reset
    addEntry(entry);
    setElapsed(0);
    setStartTime(null);
    setPausedAt(null);
    setTotalPausedMs(0);
    setTimerNotes("");
  };

  const handleAssignAndSave = async (projectId, taskId, notes) => {
    if (!pendingEntry || !projectId) return;
    const finalEntry = {
      ...pendingEntry,
      projectId,
      taskId: taskId || "",
      notes: notes || pendingEntry.notes || "",
    };
    await addEntry(finalEntry);
    setPendingEntry(null);
    setShowAssignModal(false);
    setElapsed(0);
    setStartTime(null);
    setPausedAt(null);
    setTotalPausedMs(0);
    setTimerNotes("");
    setTimerProject("");
    setTimerTask("");
    // Active timer was already cleared in handleStop
  };

  const handleDiscardEntry = () => {
    setPendingEntry(null);
    setShowAssignModal(false);
    setElapsed(0);
    setStartTime(null);
    setPausedAt(null);
    setTotalPausedMs(0);
    setTimerNotes("");
    // Active timer was already cleared in handleStop
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const projectTasks = tasks.filter(t => t.projectId === timerProject);

  if (!loaded) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text3)" }}>Loading your data...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <div className="app-logo">⏱</div>
        <div className="app-title">TimeTracker</div>
      </div>

      <div className="content">
        {tab === "timer" && (
          <TimerScreen
            projects={projects} tasks={tasks} projectTasks={projectTasks}
            timerProject={timerProject} setTimerProject={setTimerProject}
            timerTask={timerTask} setTimerTask={setTimerTask}
            timerNotes={timerNotes} setTimerNotes={setTimerNotes}
            isRunning={isRunning} isPaused={isPaused} elapsed={elapsed}
            onStart={handleStart} onPause={handlePause}
            onResume={handleResume} onStop={handleStop}
          />
        )}
        {tab === "history" && (
          <HistoryScreen
            entries={entries} projects={projects} tasks={tasks}
            onUpdate={updateEntry} onDelete={deleteEntry}
          />
        )}
        {tab === "projects" && (
          <ProjectsScreen
            projects={projects} tasks={tasks}
            onAddProject={addProject} onDeleteProject={deleteProject}
            onAddTask={addTask} onDeleteTask={deleteTask}
          />
        )}
        {tab === "reports" && (
          <ReportsScreen entries={entries} projects={projects} tasks={tasks} />
        )}
        {tab === "settings" && (
          <SettingsScreen
            entries={entries} projects={projects} tasks={tasks}
            user={user} onSignOut={handleSignOut}
          />
        )}
      </div>

      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {showAssignModal && pendingEntry && (
        <AssignModal
          entry={pendingEntry}
          projects={projects}
          tasks={tasks}
          onSave={handleAssignAndSave}
          onDiscard={handleDiscardEntry}
        />
      )}
    </div>
  );
}

// ─── ASSIGN MODAL ────────────────────────────────────────────────────
function AssignModal({ entry, projects, tasks, onSave, onDiscard }) {
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [notes, setNotes] = useState(entry.notes || "");

  const projectTasks = tasks.filter(t => t.projectId === projectId);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Assign Time Entry</div>
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
          You tracked <strong style={{ color: "var(--accent)", fontFamily: "var(--mono)" }}>{fmtDuration(entry.duration)}</strong> — assign it to a project.
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text3)", display: "block", marginBottom: 4 }}>Project *</label>
          <select
            className="selector"
            value={projectId}
            onChange={e => { setProjectId(e.target.value); setTaskId(""); }}
          >
            <option value="">Select project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {projectId && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "var(--text3)", display: "block", marginBottom: 4 }}>Task</label>
            <select
              className="selector"
              value={taskId}
              onChange={e => setTaskId(e.target.value)}
            >
              <option value="">None</option>
              {projectTasks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 12, color: "var(--text3)", display: "block", marginBottom: 4 }}>Notes</label>
          <input
            className="edit-input"
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes..."
            style={{ width: "100%" }}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-sm btn-danger" onClick={onDiscard}>Discard</button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onSave(projectId, taskId, notes)}
            disabled={!projectId}
            style={{ opacity: projectId ? 1 : 0.5 }}
          >
            Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TIMER SCREEN ────────────────────────────────────────────────────
function TimerScreen({
  projects, tasks, projectTasks,
  timerProject, setTimerProject, timerTask, setTimerTask,
  timerNotes, setTimerNotes,
  isRunning, isPaused, elapsed,
  onStart, onPause, onResume, onStop,
}) {
  const ringClass = isRunning ? (isPaused ? "paused" : "running") : "idle";
  return (
    <div>
      <div className="timer-display">
        <div className={`timer-ring ${ringClass}`}>
          <div>
            <div className="timer-time">{fmtDuration(elapsed)}</div>
            <div className="timer-label">
              {isRunning
                ? (isPaused ? "Paused" : (!timerProject ? "Running — Unassigned" : "Running"))
                : "Ready"}
            </div>
          </div>
        </div>
      </div>

      {/* Show selectors: always when idle, hidden when running with a project assigned */}
      {(!isRunning || !timerProject) && (
        <div className="timer-selectors">
          <select
            className="selector"
            value={timerProject}
            onChange={e => { setTimerProject(e.target.value); setTimerTask(""); }}
            disabled={isRunning && !!timerProject}
          >
            <option value="">Select project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {timerProject && (
            <select
              className="selector"
              value={timerTask}
              onChange={e => setTimerTask(e.target.value)}
              disabled={isRunning && !!timerProject}
            >
              <option value="">Select task (optional)...</option>
              {projectTasks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          {isRunning && !timerProject && (
            <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", marginTop: 2 }}>
              You can assign a project now or when you stop
            </div>
          )}
        </div>
      )}

      <div className="timer-actions">
        {!isRunning ? (
          <button className="btn btn-start" onClick={onStart} disabled={!timerProject}>
            ▶ Start
          </button>
        ) : (
          <>
            {isPaused ? (
              <button className="btn btn-start" onClick={onResume}>▶ Resume</button>
            ) : (
              <button className="btn btn-pause" onClick={onPause}>⏸ Pause</button>
            )}
            <button className="btn btn-stop" onClick={onStop}>■ Stop</button>
          </>
        )}
      </div>

      {isRunning && (
        <textarea
          className="notes-input"
          rows={2}
          placeholder="Add notes..."
          value={timerNotes}
          onChange={e => setTimerNotes(e.target.value)}
        />
      )}
    </div>
  );
}

// ─── HISTORY SCREEN ──────────────────────────────────────────────────
function HistoryScreen({ entries, projects, tasks, onUpdate, onDelete }) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    const proj = projects.find(p => p.id === e.projectId);
    const task = tasks.find(t => t.id === e.taskId);
    return (
      (proj?.name || "").toLowerCase().includes(q) ||
      (task?.name || "").toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q)
    );
  });

  const grouped = {};
  filtered.forEach(e => {
    const key = fmtDate(e.startTime);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  const handleUpdate = async (id, updates) => {
    await onUpdate(id, updates);
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    await onDelete(id);
    setEditingId(null);
  };

  return (
    <div>
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder="Search entries..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-text">No time entries yet.<br/>Start the timer to track your first entry.</div>
        </div>
      ) : (
        Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <div className="date-group-label">{date}</div>
            {items.map(entry => {
              const proj = projects.find(p => p.id === entry.projectId);
              const task = tasks.find(t => t.id === entry.taskId);
              return (
                <div key={entry.id}>
                  <div className="card" onClick={() => setEditingId(editingId === entry.id ? null : entry.id)} style={{ cursor: "pointer" }}>
                    <div className="card-header">
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div className="color-dot" style={{ background: proj?.color || "#666" }} />
                        <div>
                          <div className="card-project">{proj?.name || "Unknown"}</div>
                          {task && <div className="card-task">{task.name}</div>}
                        </div>
                      </div>
                      <div className="card-duration">{fmtDuration(entry.duration || 0)}</div>
                    </div>
                    <div className="card-meta">
                      <span>{fmtTime(entry.startTime)}</span>
                      <span>→</span>
                      <span>{entry.endTime ? fmtTime(entry.endTime) : "Running"}</span>
                    </div>
                    {entry.notes && <div className="card-notes">"{entry.notes}"</div>}
                  </div>

                  {editingId === entry.id && (
                    <EntryEditor
                      entry={entry} projects={projects} tasks={tasks}
                      onSave={handleUpdate} onDelete={handleDelete}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

// ─── ENTRY EDITOR ────────────────────────────────────────────────────
function EntryEditor({ entry, projects, tasks, onSave, onDelete, onCancel }) {
  const [projectId, setProjectId] = useState(entry.projectId);
  const [taskId, setTaskId] = useState(entry.taskId);
  const [notes, setNotes] = useState(entry.notes || "");
  const [startStr, setStartStr] = useState(
    entry.startTime ? new Date(entry.startTime).toTimeString().slice(0, 5) : ""
  );
  const [endStr, setEndStr] = useState(
    entry.endTime ? new Date(entry.endTime).toTimeString().slice(0, 5) : ""
  );

  const projectTasks = tasks.filter(t => t.projectId === projectId);

  const handleSave = () => {
    const st = new Date(entry.startTime);
    const et = entry.endTime ? new Date(entry.endTime) : new Date();
    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);
    st.setHours(sh, sm, 0);
    et.setHours(eh, em, 0);
    const dur = Math.max(0, Math.floor((et - st) / 1000));
    onSave(entry.id, {
      projectId, taskId, notes,
      startTime: st.toISOString(),
      endTime: et.toISOString(),
      duration: dur,
    });
  };

  return (
    <div className="edit-panel">
      <div className="edit-row">
        <span className="edit-label">Project</span>
        <select className="edit-input" value={projectId} onChange={e => { setProjectId(e.target.value); setTaskId(""); }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="edit-row">
        <span className="edit-label">Task</span>
        <select className="edit-input" value={taskId} onChange={e => setTaskId(e.target.value)}>
          <option value="">None</option>
          {projectTasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="edit-row">
        <span className="edit-label">Start</span>
        <input className="edit-input" type="time" value={startStr} onChange={e => setStartStr(e.target.value)} />
      </div>
      <div className="edit-row">
        <span className="edit-label">End</span>
        <input className="edit-input" type="time" value={endStr} onChange={e => setEndStr(e.target.value)} />
      </div>
      <div className="edit-row">
        <span className="edit-label">Notes</span>
        <input className="edit-input" type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes..." />
      </div>
      <div className="edit-actions">
        <button className="btn btn-sm btn-danger" onClick={() => onDelete(entry.id)}>Delete</button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-primary" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

// ─── PROJECTS SCREEN ─────────────────────────────────────────────────
function ProjectsScreen({ projects, tasks, onAddProject, onDeleteProject, onAddTask, onDeleteTask }) {
  const [expanded, setExpanded] = useState(null);
  const [newProject, setNewProject] = useState("");
  const [newTasks, setNewTasks] = useState({});

  const handleAddProject = () => {
    const name = newProject.trim();
    if (!name) return;
    onAddProject(name);
    setNewProject("");
  };

  const handleAddTask = (projectId) => {
    const name = (newTasks[projectId] || "").trim();
    if (!name) return;
    onAddTask(projectId, name);
    setNewTasks(prev => ({ ...prev, [projectId]: "" }));
  };

  return (
    <div>
      <div className="add-row" style={{ marginBottom: 20 }}>
        <input
          className="add-input"
          placeholder="New project name..."
          value={newProject}
          onChange={e => setNewProject(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAddProject()}
        />
        <button className="btn btn-sm btn-primary" onClick={handleAddProject}>Add</button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <div className="empty-text">No projects yet.<br/>Create your first project above.</div>
        </div>
      ) : (
        projects.map(project => {
          const projectTasks = tasks.filter(t => t.projectId === project.id);
          const isExpanded = expanded === project.id;
          return (
            <div key={project.id} className="project-item">
              <div className="project-header" onClick={() => setExpanded(isExpanded ? null : project.id)}>
                <div className="project-color-bar" style={{ background: project.color }} />
                <div className="project-name">{project.name}</div>
                <span className="project-task-count">{projectTasks.length} tasks</span>
                <span className="project-expand" style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
              </div>

              {isExpanded && (
                <div className="project-tasks">
                  {projectTasks.map(task => (
                    <div key={task.id} className="task-item">
                      <span className="task-name">{task.name}</span>
                      <button className="btn btn-sm btn-danger" onClick={() => onDeleteTask(task.id)} style={{ padding: "4px 10px", fontSize: 12 }}>×</button>
                    </div>
                  ))}
                  <div className="add-row">
                    <input
                      className="add-input"
                      placeholder="New task..."
                      value={newTasks[project.id] || ""}
                      onChange={e => setNewTasks(prev => ({ ...prev, [project.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAddTask(project.id)}
                      style={{ fontSize: 13 }}
                    />
                    <button className="btn btn-sm btn-primary" onClick={() => handleAddTask(project.id)} style={{ fontSize: 12 }}>Add</button>
                  </div>
                  <div style={{ marginTop: 10, textAlign: "right" }}>
                    <button className="btn btn-sm btn-danger" onClick={() => onDeleteProject(project.id)}>Delete Project</button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── REPORTS SCREEN ──────────────────────────────────────────────────
function ReportsScreen({ entries, projects, tasks }) {
  const [viewMode, setViewMode] = useState("week");
  const [offset, setOffset] = useState(0);
  const [reportView, setReportView] = useState("summary");

  const getRange = () => {
    const now = new Date();
    let start, end;
    if (viewMode === "day") {
      start = new Date(now);
      start.setDate(start.getDate() + offset);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === "week") {
      start = getWeekStart(now);
      start.setDate(start.getDate() + offset * 7);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start = getMonthStart(now);
      start.setMonth(start.getMonth() + offset);
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  const { start, end } = getRange();
  const rangeEntries = entries.filter(e => {
    const d = new Date(e.startTime);
    return d >= start && d <= end;
  });

  const totalSeconds = rangeEntries.reduce((sum, e) => sum + (e.duration || 0), 0);

  const projectBreakdown = {};
  rangeEntries.forEach(e => {
    if (!projectBreakdown[e.projectId]) projectBreakdown[e.projectId] = { seconds: 0, tasks: {} };
    projectBreakdown[e.projectId].seconds += e.duration || 0;
    const tid = e.taskId || "_none";
    if (!projectBreakdown[e.projectId].tasks[tid]) projectBreakdown[e.projectId].tasks[tid] = 0;
    projectBreakdown[e.projectId].tasks[tid] += e.duration || 0;
  });

  const dailyData = {};
  rangeEntries.forEach(e => {
    const dayKey = fmtDateISO(e.startTime);
    if (!dailyData[dayKey]) dailyData[dayKey] = {};
    if (!dailyData[dayKey][e.projectId]) dailyData[dayKey][e.projectId] = 0;
    dailyData[dayKey][e.projectId] += e.duration || 0;
  });

  const periodLabel = viewMode === "day"
    ? fmtDate(start)
    : viewMode === "week"
    ? `${fmtDate(start)} – ${fmtDate(end)}`
    : start.toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <div>
      <div className="view-modes">
        {["day", "week", "month"].map(v => (
          <button
            key={v}
            className={`view-mode-btn ${viewMode === v ? "active" : ""}`}
            onClick={() => { setViewMode(v); setOffset(0); }}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <div className="report-nav">
        <button className="nav-btn" onClick={() => setOffset(o => o - 1)}>‹</button>
        <span className="report-period">{periodLabel}</span>
        <button className="nav-btn" onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}>›</button>
      </div>

      <div className="total-card">
        <div className="total-label">Total Time</div>
        <div className="total-value">{fmtDuration(totalSeconds)}</div>
      </div>

      <div className="view-modes" style={{ marginBottom: 16 }}>
        {["summary", "daily"].map(v => (
          <button
            key={v}
            className={`view-mode-btn ${reportView === v ? "active" : ""}`}
            onClick={() => setReportView(v)}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {reportView === "summary" ? (
        <div>
          {Object.entries(projectBreakdown)
            .sort((a, b) => b[1].seconds - a[1].seconds)
            .map(([pid, data]) => {
              const proj = projects.find(p => p.id === pid);
              const pct = totalSeconds > 0 ? Math.round((data.seconds / totalSeconds) * 100) : 0;
              return (
                <div key={pid} style={{ marginBottom: 16 }}>
                  <div className="report-bar">
                    <div className="bar-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="color-dot" style={{ background: proj?.color || "#666" }} />
                      {proj?.name || "Unknown"}
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%`, background: proj?.color || "#666" }} />
                    </div>
                    <div className="bar-pct">{pct}%</div>
                    <div className="bar-value">{fmtDuration(data.seconds)}</div>
                  </div>
                  {Object.entries(data.tasks).map(([tid, secs]) => {
                    const task = tasks.find(t => t.id === tid);
                    const taskPct = data.seconds > 0 ? Math.round((secs / data.seconds) * 100) : 0;
                    return (
                      <div key={tid} className="report-bar" style={{ paddingLeft: 24 }}>
                        <div className="bar-label" style={{ fontSize: 12, color: "var(--text3)" }}>
                          {task?.name || "No task"}
                        </div>
                        <div className="bar-track" style={{ height: 14 }}>
                          <div className="bar-fill" style={{ width: `${taskPct}%`, background: proj?.color || "#666", opacity: 0.6 }} />
                        </div>
                        <div className="bar-pct" style={{ fontSize: 10 }}>{taskPct}%</div>
                        <div className="bar-value" style={{ fontSize: 11 }}>{fmtDuration(secs)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          {Object.keys(projectBreakdown).length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <div className="empty-text">No data for this period.</div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {Object.entries(dailyData)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, projData]) => {
              const dayTotal = Object.values(projData).reduce((s, v) => s + v, 0);
              const maxDay = Math.max(...Object.values(dailyData).map(d => Object.values(d).reduce((s, v) => s + v, 0)), 1);
              return (
                <div key={day} className="daily-bar-row">
                  <div className="daily-bar-label">{new Date(day + "T12:00:00").toLocaleDateString([], { weekday: "short" })}</div>
                  <div className="daily-bar-track">
                    {Object.entries(projData).map(([pid, secs]) => {
                      const proj = projects.find(p => p.id === pid);
                      const w = (secs / maxDay) * 100;
                      return (
                        <div
                          key={pid}
                          className="daily-bar-segment"
                          style={{ width: `${w}%`, background: proj?.color || "#666" }}
                          title={`${proj?.name}: ${fmtDuration(secs)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="daily-bar-value">{fmtDuration(dayTotal)}</div>
                </div>
              );
            })}
          {Object.keys(dailyData).length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <div className="empty-text">No data for this period.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS SCREEN ─────────────────────────────────────────────────
function SettingsScreen({ entries, projects, tasks, user, onSignOut }) {
  const [exportStart, setExportStart] = useState(fmtDateISO(new Date(Date.now() - 7 * 86400000)));
  const [exportEnd, setExportEnd] = useState(fmtDateISO(new Date()));

  const handleExportCSV = () => {
    const startDate = new Date(exportStart + "T00:00:00");
    const endDate = new Date(exportEnd + "T23:59:59");
    const filtered = entries.filter(e => {
      const d = new Date(e.startTime);
      return d >= startDate && d <= endDate;
    }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    if (filtered.length === 0) {
      alert("No entries found for the selected date range.");
      return;
    }

    const fmtT = (d) => {
      const dt = new Date(d);
      const h = dt.getHours() % 12 || 12;
      const m = String(dt.getMinutes()).padStart(2, "0");
      const ap = dt.getHours() >= 12 ? "PM" : "AM";
      return `${h}:${m} ${ap}`;
    };

    const fmtD = (d) => {
      const dt = new Date(d);
      return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
    };

    const headers = ["Date", "Project", "Task", "Start Time", "End Time", "Duration (minutes)", "Notes"];
    const rows = filtered.map(e => {
      const proj = projects.find(p => p.id === e.projectId);
      const task = tasks.find(t => t.id === e.taskId);
      return [
        fmtD(e.startTime),
        proj?.name || "Unknown",
        task?.name || "",
        fmtT(e.startTime),
        e.endTime ? fmtT(e.endTime) : "",
        Math.round((e.duration || 0) / 60),
        `"${(e.notes || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TimeTracker_${exportStart}_to_${exportEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickRange = (days) => {
    setExportEnd(fmtDateISO(new Date()));
    setExportStart(fmtDateISO(new Date(Date.now() - days * 86400000)));
  };

  return (
    <div>
      <div className="settings-section">
        <div className="settings-title">Account</div>
        <div className="settings-card">
          <div className="settings-row" style={{ cursor: "default" }}>
            <span className="settings-row-label">Signed in as</span>
            <span className="settings-row-value">{user.email}</span>
          </div>
          <div className="settings-row" onClick={onSignOut}>
            <span className="settings-row-label" style={{ color: "var(--red)" }}>Sign Out</span>
            <span className="settings-row-value" style={{ color: "var(--red)" }}>→</span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-title">CSV Export</div>
        <div className="settings-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "var(--text3)", display: "block", marginBottom: 4 }}>From</label>
              <input className="edit-input" type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "var(--text3)", display: "block", marginBottom: 4 }}>To</label>
              <input className="edit-input" type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>
          <div className="chip-row" style={{ marginBottom: 14 }}>
            <button className="chip" onClick={() => quickRange(7)}>Last 7 days</button>
            <button className="chip" onClick={() => quickRange(30)}>Last 30 days</button>
            <button className="chip" onClick={() => quickRange(90)}>Last 90 days</button>
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleExportCSV}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-title">Data</div>
        <div className="settings-card">
          <div className="settings-row" style={{ cursor: "default" }}>
            <span className="settings-row-label">Total Entries</span>
            <span className="settings-row-value">{entries.length}</span>
          </div>
          <div className="settings-row" style={{ cursor: "default" }}>
            <span className="settings-row-label">Projects</span>
            <span className="settings-row-value">{projects.length}</span>
          </div>
          <div className="settings-row" style={{ cursor: "default" }}>
            <span className="settings-row-label">Tasks</span>
            <span className="settings-row-value">{tasks.length}</span>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "24px 0 0", color: "var(--text3)", fontSize: 12 }}>
        TimeTracker Web v1.2
      </div>
    </div>
  );
}
