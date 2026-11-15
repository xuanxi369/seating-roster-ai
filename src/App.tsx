import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  FileSpreadsheet,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { MappingEditor } from './components/MappingEditor';
import { SourcePreview } from './components/SourcePreview';
import { UploadBox } from './components/UploadBox';
import { demoData } from './lib/demo';
import { downloadRoster, readExcelFile } from './lib/excel';
import { prepareImage } from './lib/image';
import { buildRoster, columnName, reconcileRosterOptions, sourceId, validateSheets } from './lib/roster';
import {
  planSchema,
  type AnalysisResult,
  type Person,
  type PersonOverride,
  type Plan,
  type ProviderId,
  type ProviderInfo,
  type SheetData,
} from './lib/schema';

const initialProviders: ProviderInfo[] = [
  { id: 'qwen', label: '千问', model: '', enabled: false },
  { id: 'deepseek', label: 'DeepSeek', model: '', enabled: false },
  { id: 'zhipu', label: '智谱', model: '', enabled: false },
  { id: 'openai', label: 'ChatGPT / OpenAI', model: '', enabled: false },
  { id: 'anthropic', label: 'Claude', model: '', enabled: false },
];
const pageSize = 40;
export default function App() {
  const [sheets, setSheets] = useState<SheetData[]>([]),
    [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [excelName, setExcelName] = useState(''),
    [imageName, setImageName] = useState(''),
    [image, setImage] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null),
    [view, setView] = useState<'upload' | 'review'>('upload');
  const [overrides, setOverrides] = useState<Record<string, PersonOverride>>({});
  const [excluded, setExcluded] = useState<string[]>([]),
    [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState(initialProviders),
    [provider, setProvider] = useState<ProviderId>('qwen');
  const [token, setToken] = useState(''),
    [tokenDraft, setTokenDraft] = useState(''),
    [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [connecting, setConnecting] = useState(false),
    [exporting, setExporting] = useState(false);
  const [error, setError] = useState(''),
    [settingsError, setSettingsError] = useState(''),
    [notice, setNotice] = useState('');
  const [showSettings, setShowSettings] = useState(false),
    [showHelp, setShowHelp] = useState(false),
    [showMapping, setShowMapping] = useState(false);
  const [demo, setDemo] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [exported, setExported] = useState(false);
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [resultModel, setResultModel] = useState('');
  const activeSheets = useMemo(
    () => sheets.filter((s) => selectedSheets.includes(s.name)),
    [sheets, selectedSheets],
  );
  const calculated = useMemo(() => {
    if (!plan) return { data: null, error: '' };
    try {
      return {
        data: buildRoster(plan, activeSheets, { overrides, excluded, manualAssignments }),
        error: '',
      };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : '请检查分区。' };
    }
  }, [plan, activeSheets, overrides, excluded, manualAssignments]);
  const review = calculated.data;
  const filtered = useMemo(
    () =>
      review?.people.filter(
        (p) =>
          (filter === 'all' || p.zoneId === filter) &&
          (search === '' ||
            [p.name, p.phone, p.organization, p.title, p.zone, p.sourceAddress].some((v) =>
              v.toLowerCase().includes(search.toLowerCase()),
            )),
      ) || [],
    [review, filter, search],
  );
  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
    safePage = Math.min(page, maxPage);
  const shown = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const currentProvider = providers.find((p) => p.id === provider)!;
  const ignoredCells = plan
    ? activeSheets.flatMap((s) =>
        s.cells
          .filter(
            (c) =>
              excluded.includes(sourceId(s.name, c.address)) ||
              plan.ignoredCells.some((i) => i.sheet === s.name && i.address === c.address),
          )
          .map((c) => ({ ...c, sheet: s.name, id: sourceId(s.name, c.address) })),
      )
    : [];
  const resetEdits = () => {
    setOverrides({});
    setExcluded([]);
    setManualAssignments({});
    setAcknowledged(false);
    setExported(false);
    setSearch('');
    setFilter('all');
    setPage(0);
  };
  const invalidate = () => {
    setAcknowledged(false);
    setExported(false);
    setNotice('');
  };

  async function uploadExcel(file: File) {
    setReading(true);
    setError('');
    try {
      const read = await readExcelFile(file);
      setSheets(read);
      setSelectedSheets(read.map((s) => s.name));
      setExcelName(file.name);
      setPlan(null);
      setView('upload');
      setDemo(false);
      resetEdits();
      setNotice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法读取表格。');
    } finally {
      setReading(false);
    }
  }
  async function uploadImage(file: File) {
    setReading(true);
    setError('');
    try {
      setImage(await prepareImage(file));
      setImageName(file.name);
      setPlan(null);
      setDemo(false);
      setView('upload');
      resetEdits();
      setNotice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法读取图片。');
    } finally {
      setReading(false);
    }
  }
  function loadDemo() {
    const data = demoData();
    setSheets(data.sheets);
    setSelectedSheets(data.sheets.map((s) => s.name));
    setPlan(data.plan);
    setExcelName('示例座次表.xlsx');
    setImageName('示例会场座次图');
    setImage('/demo-venue.svg');
    setDemo(true);
    setView('review');
    resetEdits();
    setError('');
    setNotice('');
    setResultModel('示例数据 · 未调用 AI');
  }
  async function connect() {
    setConnecting(true);
    setSettingsError('');
    try {
      const response = await fetch('/api/config', {
        headers: { Authorization: `Bearer ${tokenDraft.trim()}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '连接失败。');
      setProviders(data.providers);
      setToken(tokenDraft.trim());
      const available = (data.providers as ProviderInfo[]).filter((p) => p.enabled);
      if (available.length) {
        setProvider(available[0].id);
        setShowSettings(false);
        setNotice(`已连接，可使用 ${available.map((p) => p.label).join('、')}。`);
      } else {
        setSettingsError('口令验证通过，但尚未配置任何模型 API 密钥，请联系管理员。');
      }
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : '无法连接服务器，请检查部署。');
    } finally {
      setConnecting(false);
    }
  }
  async function analyze() {
    if (!token || !currentProvider.enabled) {
      setShowSettings(true);
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 105_000);
    try {
      validateSheets(activeSheets);
      if (!image || image.startsWith('/'))
        throw new Error('请先上传会场图片。示例图片仅用于演示。');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, image, sheets: activeSheets, notes }),
        signal: controller.signal,
      });
      const result = (await response.json()) as AnalysisResult & { error?: string };
      if (!response.ok) throw new Error(result.error || '识别失败。');
      const checked = planSchema.parse(result.plan);
      const built = buildRoster(checked, activeSheets);
      if (built.errors.length) throw new Error(built.errors[0]);
      setPlan(checked);
      resetEdits();
      setView('review');
      setDemo(false);
      setResultModel(`${result.provider} · ${result.model}`);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? '识别等待超时，请稍后重试或手动分区。'
          : e instanceof Error
            ? e.message
            : '识别失败，请重试。',
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  function startManual() {
    setError('');
    try {
      validateSheets(activeSheets);
      const first = activeSheets[0];
      const minRow = Math.min(...first.cells.map((c) => c.row)),
        maxRow = Math.max(...first.cells.map((c) => c.row)),
        minCol = Math.min(...first.cells.map((c) => c.column)),
        maxCol = Math.max(...first.cells.map((c) => c.column));
      const draft: Plan = {
        summary: '手动整理：请根据会场图设置各分区和人员来源范围。',
        warnings: [],
        ignoredCells: [],
        zones: [
          {
            id: 'A',
            label: 'A区',
            position: '',
            rows: null,
            columns: null,
            direction: 'unknown',
            confidence: 'high',
            bbox: null,
            sources: [
              {
                sheet: first.name,
                range: `${columnName(minCol)}${minRow}:${columnName(maxCol)}${maxRow}`,
                mode: 'grid',
                nameColumn: null,
                phoneColumn: null,
                organizationColumn: null,
                titleColumn: null,
              },
            ],
          },
        ],
      };
      setPlan(draft);
      resetEdits();
      setView('review');
      setShowMapping(true);
      setDemo(false);
      setResultModel('手动整理 · 未调用 AI');
    } catch (e) {
      setError(e instanceof Error ? e.message : '请先上传表格。');
    }
  }
  function editPerson(person: Person, key: keyof PersonOverride, value: string) {
    setOverrides((o) => ({ ...o, [person.id]: { ...o[person.id], [key]: value } }));
    invalidate();
  }
  function restore(id: string) {
    setExcluded((e) => e.filter((v) => v !== id));
    setPlan((p) =>
      p
        ? { ...p, ignoredCells: p.ignoredCells.filter((c) => sourceId(c.sheet, c.address) !== id) }
        : p,
    );
    invalidate();
  }
  async function exportExcel() {
    if (
      !review ||
      !acknowledged ||
      review.errors.length ||
      review.unassigned.length ||
      !review.people.length
    )
      return;
    setExporting(true);
    setError('');
    try {
      await downloadRoster(review.people);
      setExported(true);
      setNotice('人员库已导出，包含当前核对后的全部记录。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败。');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="席位首页">
          <span className="brand-icon">
            <Armchair size={25} />
          </span>
          <div>
            <strong>席位</strong>
            <span>AI 人员库助手</span>
          </div>
        </a>
        <div className="nav-label">工作空间</div>
        <nav>
          <button className="nav-item active" onClick={() => setView(plan ? 'review' : 'upload')}>
            <LayoutDashboard size={18} />
            人员库统计
            <span className="nav-dot" />
          </button>
          <button className="nav-item" onClick={() => setShowSettings(true)}>
            <Settings2 size={18} />
            模型连接
          </button>
          <button className="nav-item" onClick={() => setShowHelp(true)}>
            <HelpCircle size={18} />
            使用说明
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <ShieldCheck size={16} />
            内部团队工作空间
          </div>
          <p>
            文件在当前页面处理。
            <br />
            导出前请核对名单与分区。
          </p>
          <span className="version">SEATING ROSTER / 0.1</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            工作台 <span className="breadcrumb-slash">/</span> <strong>人员库统计</strong>
          </span>
          <button className="connection-btn" onClick={() => setShowSettings(true)}>
            <span className={`status-dot ${token ? 'connected' : ''}`} />
            {token ? '模型已连接' : '连接 AI 模型'}
            <Settings2 size={14} />
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">让每一位来宾都有归属</span>
              <h1>{view === 'upload' ? '从座次表，到人员库。' : '核对一下，就可以导出。'}</h1>
              <p>
                {view === 'upload'
                  ? '上传会场座次图和 Excel，AI 帮你理解分区，你来确认最终名单。'
                  : `${excelName} · ${resultModel}`}
              </p>
            </div>
            <div className="heading-actions">
              {view === 'upload' ? (
                <button className="secondary-btn" onClick={loadDemo} disabled={busy || reading}>
                  <Sparkles size={16} />
                  体验示例
                </button>
              ) : (
                <button
                  className="secondary-btn"
                  onClick={() => {
                    setView('upload');
                    setError('');
                  }}
                >
                  <Upload size={16} />
                  上传新文件
                </button>
              )}
            </div>
          </div>
          <div className="stepper">
            {[
              { icon: Upload, label: '上传文件', detail: '座次图 + 座次表' },
              { icon: Users, label: '确认分区', detail: '检查名单与人数' },
              { icon: FileCheck2, label: '导出人员库', detail: '标准五字段 Excel' },
            ].map((step, i) => {
              const Icon = step.icon;
              const active =
                view === 'upload' ? i === 0 : (i === 1 && !exported) || (i === 2 && exported);
              const done = (view === 'review' && i === 0) || (exported && i === 1);
              return (
                <div
                  className={`step ${active ? 'current' : ''} ${done ? 'done' : ''}`}
                  key={step.label}
                >
                  <span className="step-icon">
                    {done ? <Check size={18} /> : <Icon size={18} />}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                  {i < 2 && <ChevronRight className="step-chevron" size={17} />}
                </div>
              );
            })}
          </div>
          {error && (
            <div className="error-box" role="alert">
              <AlertCircle size={18} />
              {error}
              <button className="icon-btn" aria-label="关闭错误提示" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice-box" role="status">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {view === 'upload' ? (
            <>
              <div className="upload-grid">
                <UploadBox
                  kind="image"
                  name={imageName}
                  image={image}
                  busy={busy || reading}
                  onFile={uploadImage}
                />
                <UploadBox
                  kind="excel"
                  name={excelName}
                  busy={busy || reading}
                  onFile={uploadExcel}
                />
              </div>
              {sheets.length > 0 && (
                <div className="sheet-selection">
                  <span>参与分析的工作表</span>
                  {sheets.map((sheet) => (
                    <label key={sheet.name}>
                      <input
                        type="checkbox"
                        checked={selectedSheets.includes(sheet.name)}
                        disabled={busy || reading}
                        onChange={(e) => {
                          setSelectedSheets((names) =>
                            e.target.checked
                              ? [...names, sheet.name]
                              : names.filter((n) => n !== sheet.name),
                          );
                          setPlan(null);
                          resetEdits();
                        }}
                      />
                      {sheet.name}
                      <small>{sheet.cells.length} 个非空格</small>
                    </label>
                  ))}
                </div>
              )}
              <section className="analysis-card">
                <div className="analysis-card-title">
                  <span className="analysis-spark">
                    <Sparkles size={20} />
                  </span>
                  <div>
                    <h3>AI 理解布局，原表保留姓名</h3>
                    <p>识别会场分区，匹配表格范围，再由你核对导出。</p>
                  </div>
                  <span className="pill">五家模型可切换</span>
                </div>
                <div className="analysis-controls">
                  <label className="model-select">
                    识别模型
                    <select
                      aria-label="选择识别模型"
                      value={provider}
                      disabled={busy}
                      onChange={(e) => setProvider(e.target.value as ProviderId)}
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.enabled ? '' : ' · 未连接'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="notes-input">
                    补充说明 <span>（可选）</span>
                    <input
                      maxLength={1500}
                      value={notes}
                      disabled={busy}
                      placeholder="例如：舞台下方是 A 区，左侧是 B 区"
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary-btn analyze-btn"
                    disabled={busy || reading || !image || !activeSheets.length}
                    onClick={analyze}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="spin" size={18} />
                        正在识别分区…
                      </>
                    ) : (
                      <>
                        <Sparkles size={17} />
                        开始 AI 识别
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </div>
                <div className="analysis-footer">
                  <span>
                    <LockKeyhole size={13} />
                    开始识别时，图片与所选表格文字会发送至你选择的 AI 服务。
                  </span>
                  <button
                    className="text-btn"
                    disabled={!activeSheets.length || busy || reading}
                    onClick={startManual}
                  >
                    手动分区
                    <ArrowRight size={14} />
                  </button>
                </div>
                {busy && (
                  <p className="loading-note" role="status">
                    正在对照图片和表格，通常需要几十秒。完成后你可以修改分区和人员信息。
                  </p>
                )}
              </section>
              <div className="output-explainer">
                <span className="output-icon">
                  <FileSpreadsheet size={22} />
                </span>
                <div>
                  <strong>导出与你的人员库模板一致的字段</strong>
                  <div className="field-chips">
                    {['姓名', '手机号', '单位', '职务', '分座区域'].map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                </div>
                <p>
                  表格中没有的信息保留为空。
                  <br />
                  重名与姓名备注会保留并提醒核对。
                </p>
              </div>
            </>
          ) : (
            <>
              {calculated.error && (
                <div className="error-box">
                  {calculated.error}
                  <button className="text-btn" onClick={() => setShowMapping(true)}>
                    修改分区
                  </button>
                </div>
              )}
              {review && plan && (
                <>
                  <div className="review-overview">
                    <section className="venue-card">
                      <div className="section-title">
                        <h3>会场分区对照</h3>
                        <span className="muted">{demo ? '示例会场' : '你的座次图'}</span>
                      </div>
                      <div className="venue-image">
                        {image ? (
                          <>
                            <img src={image} alt="会场座次图，用于核对分区" />
                            {review.zones.map(
                              (zone, i) =>
                                zone.bbox && (
                                  <button
                                    key={zone.id}
                                    className={`zone-marker zone-color-${i % 4} ${filter === zone.id ? 'selected' : ''}`}
                                    style={{
                                      left: `${zone.bbox.x * 100}%`,
                                      top: `${zone.bbox.y * 100}%`,
                                      width: `${zone.bbox.width * 100}%`,
                                      height: `${zone.bbox.height * 100}%`,
                                    }}
                                    onClick={() => {
                                      setFilter(zone.id);
                                      setPage(0);
                                    }}
                                    aria-label={`查看 ${zone.label} 人员`}
                                  >
                                    <span>{zone.label}</span>
                                  </button>
                                ),
                            )}
                          </>
                        ) : (
                          <div className="image-placeholder">
                            手动整理模式
                            <br />
                            可返回上传会场图片
                          </div>
                        )}
                      </div>
                      <div className="venue-footer">
                        点击分区查看人员；分区位置与人数以核对结果为准。
                      </div>
                    </section>
                    <section className="zones-card">
                      <div className="section-title">
                        <h3>分区统计</h3>
                        <button className="text-btn" onClick={() => setShowMapping(true)}>
                          <Settings2 size={15} />
                          修改分区
                        </button>
                      </div>
                      <div className="zone-summary-total">
                        <strong>
                          {review.people.length}
                          <small>条</small>
                        </strong>
                        <span>当前人员记录</span>
                        {demo && <span className="demo-pill">演示模式</span>}
                      </div>
                      <div className="zone-summary-list">
                        {review.zones.map((zone, i) => (
                          <button
                            className={`zone-summary-row ${filter === zone.id ? 'selected' : ''}`}
                            key={zone.id}
                            onClick={() => {
                              setFilter(filter === zone.id ? 'all' : zone.id);
                              setPage(0);
                            }}
                          >
                            <span className={`zone-dot zone-color-${i % 4}`} />
                            <div>
                              <strong>{zone.label}</strong>
                              <small>
                                {zone.position || zone.sources.map((s) => s.range).join('、')}
                              </small>
                            </div>
                            <div className="zone-amount">
                              <strong>{zone.count}</strong>
                              <span>
                                {zone.capacity === null ? '容量未识别' : `/ ${zone.capacity} 座`}
                              </span>
                            </div>
                            {zone.overflow > 0 ? (
                              <span className="overflow-tag">超出 {zone.overflow}</span>
                            ) : (
                              <CheckCircle2 size={16} className="success-icon" />
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                  <section className="review-notes">
                    <div className="review-notes-heading">
                      <AlertCircle size={18} />
                      <strong>导出前，留意这些信息</strong>
                      <span>不会自动删减记录</span>
                    </div>
                    <div className="issue-chips">
                      {review.zones.some((z) => z.overflow > 0) && (
                        <span className="issue-chip warning">
                          人数超过座位：
                          {review.zones
                            .filter((z) => z.overflow > 0)
                            .map((z) => `${z.label} +${z.overflow}`)
                            .join('、')}
                        </span>
                      )}
                      {review.duplicates.size > 0 && (
                        <span className="issue-chip">{review.duplicates.size} 组重名，已保留</span>
                      )}
                      {review.annotated.length > 0 && (
                        <span className="issue-chip">{review.annotated.length} 条姓名备注</span>
                      )}
                      {review.unassigned.length > 0 && (
                        <span className="issue-chip warning">
                          {review.unassigned.length} 个单元格未归档
                        </span>
                      )}
                      {plan.zones.some((z) => z.confidence !== 'high') && (
                        <span className="issue-chip warning">部分分区需确认</span>
                      )}
                      <span className="issue-chip neutral">缺失字段保持为空</span>
                    </div>
                    {plan.warnings
                      .filter((w) => !demo)
                      .map((warning, i) => (
                        <p className="ai-warning" key={i}>
                          {warning}
                        </p>
                      ))}
                    {review.errors.map((e) => (
                      <p className="danger-text" key={e}>
                        {e}
                      </p>
                    ))}
                  </section>
                  {review.unassigned.length > 0 && (
                    <section className="unassigned-panel">
                      <h3>这些单元格还没有归属</h3>
                      <p>将人员分入对应区域，或将标题、说明等忽略。未处理完之前不能导出。</p>
                      <div className="unassigned-list">
                        {review.unassigned.map((cell) => (
                          <div className="unassigned-row" key={cell.id}>
                            <code>{cell.id}</code>
                            <strong>
                              {cell.text}
                              {!cell.assignable && (
                                <small>这项信息位于名单的非姓名列，请修正来源范围或忽略。</small>
                              )}
                            </strong>
                            <select
                              aria-label={`为 ${cell.text} 指定分区`}
                              value=""
                              disabled={!cell.assignable}
                              onChange={(e) => {
                                setManualAssignments((a) => ({ ...a, [cell.id]: e.target.value }));
                                invalidate();
                              }}
                            >
                              <option value="">选择分区</option>
                              {plan.zones.map((z) => (
                                <option value={z.id} key={z.id}>
                                  {z.label}
                                </option>
                              ))}
                            </select>
                            <button
                              className="text-btn"
                              onClick={() => {
                                setExcluded((e) => [...e, cell.id]);
                                invalidate();
                              }}
                            >
                              忽略
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  <section className="roster-card">
                    <div className="roster-toolbar">
                      <div>
                        <h3>
                          人员名单 <span className="count-badge">{review.people.length}</span>
                        </h3>
                        <p>可直接修改字段，原始单元格位置保留用于核对。</p>
                      </div>
                      <label className="search-input">
                        <input
                          aria-label="搜索人员"
                          placeholder="搜索姓名、单位或单元格"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(0);
                          }}
                        />
                      </label>
                    </div>
                    <div className="filter-tabs">
                      <button
                        className={filter === 'all' ? 'active' : ''}
                        onClick={() => {
                          setFilter('all');
                          setPage(0);
                        }}
                      >
                        全部 <span>{review.people.length}</span>
                      </button>
                      {review.zones.map((z) => (
                        <button
                          key={z.id}
                          className={filter === z.id ? 'active' : ''}
                          onClick={() => {
                            setFilter(z.id);
                            setPage(0);
                          }}
                        >
                          {z.label} <span>{z.count}</span>
                        </button>
                      ))}
                    </div>
                    <div className="roster-scroll">
                      <table className="roster-table">
                        <thead>
                          <tr>
                            <th className="index-col">序号</th>
                            <th>姓名</th>
                            <th>手机号</th>
                            <th>单位</th>
                            <th>职务</th>
                            <th>分座区域</th>
                            <th>原表位置</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((person, i) => (
                            <tr
                              key={person.id}
                              className={
                                review.duplicates.has(person.name) || /[（(]/.test(person.name)
                                  ? 'needs-review'
                                  : ''
                              }
                            >
                              <td className="row-index">{safePage * pageSize + i + 1}</td>
                              {(['name', 'phone', 'organization', 'title'] as const).map((key) => (
                                <td key={key}>
                                  <input
                                    aria-label={`${person.sourceAddress} ${key === 'name' ? '姓名' : key === 'phone' ? '手机号' : key === 'organization' ? '单位' : '职务'}`}
                                    value={person[key]}
                                    placeholder={key === 'name' ? '姓名' : '—'}
                                    title={person[key]}
                                    onChange={(e) => editPerson(person, key, e.target.value)}
                                  />
                                  {key === 'name' && review.duplicates.has(person.name) && (
                                    <span className="duplicate-label">重名</span>
                                  )}
                                </td>
                              ))}
                              <td>
                                <select
                                  aria-label={`${person.sourceAddress} 分座区域`}
                                  value={person.zoneId}
                                  onChange={(e) => editPerson(person, 'zoneId', e.target.value)}
                                >
                                  {plan.zones.map((z) => (
                                    <option key={z.id} value={z.id}>{z.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td
                                className="source-address"
                                title={`${person.sourceSheet}!${person.sourceAddress}`}
                              >
                                {person.sourceAddress}
                              </td>
                              <td>
                                <button
                                  className="icon-btn remove-person"
                                  aria-label={`排除 ${person.name}`}
                                  onClick={() => {
                                    setExcluded((e) => [...e, person.id]);
                                    invalidate();
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!shown.length && <div className="empty-search">没有匹配的人员记录。</div>}
                    </div>
                    <div className="table-footer">
                      <span>
                        显示{' '}
                        {filtered.length
                          ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)}`
                          : '0'}{' '}
                        条，共 {filtered.length} 条
                      </span>
                      <div>
                        <button
                          className="icon-btn"
                          aria-label="上一页"
                          disabled={safePage === 0}
                          onClick={() => setPage(safePage - 1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <span>
                          {safePage + 1} / {maxPage + 1}
                        </span>
                        <button
                          className="icon-btn"
                          aria-label="下一页"
                          disabled={safePage === maxPage}
                          onClick={() => setPage(safePage + 1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                  </section>
                  {ignoredCells.length > 0 && (
                    <details className="ignored-panel">
                      <summary>已忽略 / 排除的数据（{ignoredCells.length} 个单元格）</summary>
                      <p>AI 判断的标题和你排除的记录仍可恢复。恢复后需要重新核对。</p>
                      {ignoredCells.map((cell) => (
                        <div className="ignored-row" key={cell.id}>
                          <code>{cell.id}</code>
                          <span>{cell.text}</span>
                          <small>
                            {plan.ignoredCells.find((c) => sourceId(c.sheet, c.address) === cell.id)
                              ?.reason || '手动排除'}
                          </small>
                          <button className="text-btn" onClick={() => restore(cell.id)}>
                            <RotateCcw size={13} />
                            恢复
                          </button>
                        </div>
                      ))}
                    </details>
                  )}
                  <SourcePreview sheets={activeSheets} />
                  <section className={`export-panel ${exported ? 'exported' : ''}`}>
                    <label className="acknowledgement">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      <span>
                        <strong>我已核对分区、名单与人数</strong>
                        <small>包括重名、姓名备注、缺失信息，以及人数超过座位容量的情况。</small>
                      </span>
                    </label>
                    <button
                      className="primary-btn export-btn"
                      disabled={
                        !acknowledged ||
                        !!review.errors.length ||
                        !!review.unassigned.length ||
                        !review.people.length ||
                        exporting
                      }
                      onClick={exportExcel}
                    >
                      {exporting ? (
                        <Loader2 className="spin" size={18} />
                      ) : exported ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <Download size={18} />
                      )}
                      导出人员库 .xlsx
                    </button>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>姓名 · 手机号 · 单位 · 职务 · 分座区域</span>
            <span>文件保存在当前页面，刷新后需重新上传。</span>
          </footer>
        </main>
      </div>
      {showMapping && plan && (
        <MappingEditor
          plan={plan}
          sheets={activeSheets}
          onClose={() => setShowMapping(false)}
          onSave={(saved) => {
            const next = reconcileRosterOptions(saved, activeSheets, {
              overrides, excluded, manualAssignments,
            });
            setOverrides(next.overrides || {});
            setExcluded(next.excluded || []);
            setManualAssignments(next.manualAssignments || {});
            setPlan(saved);
            setShowMapping(false);
            invalidate();
            setError('');
            setFilter('all');
            setPage(0);
          }}
        />
      )}
      {showSettings && (
        <div className="modal-backdrop">
          <section
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-title">
              <div>
                <span className="modal-icon">
                  <LockKeyhole size={23} />
                </span>
                <h2 id="settings-title">连接团队的 AI 模型</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="关闭模型连接"
                onClick={() => setShowSettings(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p>输入管理员设置的网站访问口令。AI 密钥由管理员配置在服务器端。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void connect();
              }}
            >
              <label>
                网站访问口令
                <input
                  type="password"
                  autoComplete="off"
                  value={tokenDraft}
                  placeholder="输入团队访问口令"
                  onChange={(e) => setTokenDraft(e.target.value)}
                  autoFocus
                />
              </label>
              {settingsError && (
                <p className="error-box" role="alert">
                  {settingsError}
                </p>
              )}
              <button
                className="primary-btn full-width"
                disabled={!tokenDraft.trim() || connecting}
              >
                {connecting ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
                验证并连接
              </button>
            </form>
            <div className="provider-list">
              {providers.map((p) => (
                <div key={p.id}>
                  <span>{p.label}</span>
                  <small>{p.enabled ? p.model : '等待管理员配置'}</small>
                  {p.enabled && <CheckCircle2 size={15} className="success-icon" />}
                </div>
              ))}
            </div>
            <p className="modal-tip">暂未配置也可以体验示例，或上传表格手动分区。</p>
            {token && (
              <button
                className="text-btn"
                onClick={() => {
                  setToken('');
                  setTokenDraft('');
                  setProviders(initialProviders);
                  setShowSettings(false);
                }}
              >
                断开本页连接
              </button>
            )}
          </section>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="modal-title">
              <h2 id="help-title">三步整理人员库</h2>
              <button
                className="icon-btn"
                aria-label="关闭使用说明"
                onClick={() => setShowHelp(false)}
              >
                <X size={20} />
              </button>
            </div>
            <ol className="help-steps">
              <li>
                <strong>上传会场座次图和 .xlsx 座次表</strong>
                <p>
                  图片应能清楚看到分区名称。表格可以是座次网格，也可以是一行一人的名单。多张工作表可选择参与分析。
                </p>
              </li>
              <li>
                <strong>让 AI 识别，再确认分区</strong>
                <p>
                  AI
                  只判断分区和数据范围；姓名等字段从原表读取。可修改分区范围、调整姓名和区域，排除标题。未归档的单元格必须先处理。
                </p>
              </li>
              <li>
                <strong>核对后导出五字段人员库</strong>
                <p>
                  重名和括号备注保留。源表缺失的手机号、单位、职务留空。座位不足只提醒，不会自动删人。导出包含当前完整名单，不受搜索筛选影响。
                </p>
              </li>
            </ol>
            <div className="help-note">
              <FileSpreadsheet size={20} />
              <p>如果只需要填写区域，无需增加排号和座号。当前导出严格遵循既有五字段模板。</p>
            </div>
            <button className="primary-btn full-width" onClick={() => setShowHelp(false)}>
              开始整理
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
