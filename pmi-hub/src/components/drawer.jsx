import { useEffect, useState } from 'preact/hooks';
import { t, fmtDate, fmtDateTime, relDue } from '../i18n.js';
import { networkDays, todayISO, taskHealth, daysLate, byOrder } from '../util.js';
import { S, IDX, ensureHistory, entityHistory, updateTask, deleteTask, restoreTask, addComment, canEdit, projectWorkstreams, projectTasks, actorName, toast } from '../store.js';
import { closeTask, openTask } from '../nav.js';
import { Icon, EditText, DateInput, PersonPicker, STATUSES, statusLabel, StatusPill, confirmDialog } from './ui.jsx';
import { EventList } from './events.jsx';

export function TaskDrawer({ taskId }) {
  const task = IDX.tasks.get(taskId);
  const project = task && IDX.projects.get(task.projectId);
  useEffect(() => {
    if (task) ensureHistory(task.projectId);
  }, [task && task.projectId]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.overlay')) closeTask();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="drawer-wrap" onPointerDown={(e) => e.target === e.currentTarget && closeTask()}>
      <aside class="drawer" role="dialog" aria-label={task ? task.title : t('Task')}>
        {!task ? (
          <div class="drawer-body">
            <header class="drawer-head">
              <span />
              <button class="icon-btn" onClick={closeTask} aria-label={t('Close')}>
                <Icon name="x" />
              </button>
            </header>
            <p class="muted">{S.loaded.tasks ? t('This task no longer exists.') : t('Loading task…')}</p>
          </div>
        ) : (
          <TaskBody task={task} project={project} />
        )}
      </aside>
    </div>
  );
}

function TaskBody({ task, project }) {
  const today = todayISO();
  const editable = canEdit() && !task.deleted;
  const save = (patch) => updateTask(task, patch).catch(() => {});
  const ws = IDX.workstreams.get(task.workstreamId);
  const wss = project ? projectWorkstreams(project.id) : [];
  const health = taskHealth(task, today);
  const events = entityHistory(task.projectId, task.id);
  const deps = (task.dependsOn || []).map((id) => IDX.tasks.get(id)).filter(Boolean);
  const openDeps = deps.filter((d) => d.status !== 'done' && d.status !== 'na' && !d.deleted);
  const blocking = project ? projectTasks(project.id).filter((x) => (x.dependsOn || []).includes(task.id)) : [];
  const nd = networkDays(task.start, task.due);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const sendComment = async () => {
    const text = comment.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await addComment('task', task, text);
      setComment('');
    } finally {
      setSending(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirmDialog({
      title: t('Delete this task?'),
      body: t('"{n}" is moved to the trash under History. It can be restored with its full history.', { n: task.title }),
      ok: t('Delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteTask(task).catch(() => {});
    toast('ok', t('The task was moved to the trash.'));
    closeTask();
  };

  const candidates = project
    ? projectTasks(project.id)
        .filter((x) => x.id !== task.id && !(task.dependsOn || []).includes(x.id))
        .sort((a, b) => byOrder(IDX.workstreams.get(a.workstreamId) || {}, IDX.workstreams.get(b.workstreamId) || {}) || byOrder(a, b))
    : [];

  return (
    <div class="drawer-body">
      <header class="drawer-head">
        <div class="drawer-crumbs">
          {project && <span class="crumb">{project.name}</span>}
          {ws && <span class="crumb ws">{ws.name}</span>}
        </div>
        <button class="icon-btn" onClick={closeTask} aria-label={t('Close')}>
          <Icon name="x" />
        </button>
      </header>

      {task.deleted && (
        <div class="banner warn">
          <Icon name="trash" />
          <span>{t('This task is in the trash.')}</span>
          {canEdit() && (
            <button class="btn small" onClick={() => restoreTask(task)}>
              {t('Restore')}
            </button>
          )}
        </div>
      )}

      <EditText id="task-title" class="title-in" value={task.title} disabled={!editable} onSave={(v) => v && save({ title: v })} ariaLabel={t('Title')} />

      {(health === 'overdue' || health === 'blocked' || openDeps.length > 0 || (task.start && task.due && task.due < task.start)) && (
        <div class="warns">
          {health === 'overdue' && (
            <div class="warn-line bad">
              <Icon name="alert" size={14} /> {t('{n} days overdue (due {d}).', { n: daysLate(task, today), d: fmtDate(task.due) })}
            </div>
          )}
          {health === 'blocked' && (
            <div class="warn-line bad">
              <Icon name="alert" size={14} /> {t('Blocked. Describe what is needed in a comment.')}
            </div>
          )}
          {openDeps.length > 0 && (
            <div class="warn-line warn">
              <Icon name="chain" size={14} /> {t('Waiting for: {list}', { list: openDeps.map((d) => d.title).join(', ') })}
            </div>
          )}
          {task.start && task.due && task.due < task.start && (
            <div class="warn-line warn">
              <Icon name="alert" size={14} /> {t('The due date is before the start date.')}
            </div>
          )}
        </div>
      )}

      <div class="seg-status" role="radiogroup" aria-label={t('Status')}>
        {STATUSES.map((s) => (
          <button type="button" role="radio" aria-checked={task.status === s} class={`st-${s} ${task.status === s ? 'on' : ''}`} disabled={!editable} onClick={() => save({ status: s })}>
            {statusLabel(s)}
          </button>
        ))}
      </div>

      <div class="props">
        <div class="prop">
          <label for="task-owners">{t('Owners')}</label>
          <PersonPicker id="task-owners" value={task.ownerIds || []} onChange={(ownerIds) => save({ ownerIds })} disabled={!editable} />
        </div>
        <div class="prop">
          <label for="task-ws">{t('Workstream')}</label>
          <select id="task-ws" value={task.workstreamId || ''} disabled={!editable} onChange={(e) => save({ workstreamId: e.currentTarget.value || null })}>
            {!task.workstreamId && <option value="">{t('None')}</option>}
            {wss.map((w) => (
              <option value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        {project && (project.phases || []).length > 0 && (
          <div class="prop">
            <label for="task-phase">{t('Phase')}</label>
            <select id="task-phase" value={task.phaseId || ''} disabled={!editable} onChange={(e) => save({ phaseId: e.currentTarget.value || null })}>
              <option value="">{t('No phase')}</option>
              {project.phases.map((p) => (
                <option value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div class="prop dates">
          <label for="task-start">{t('Start – due')}</label>
          <div class="date-pair">
            <DateInput id="task-start" value={task.start} disabled={!editable} onSave={(start) => save({ start })} ariaLabel={t('Start date')} />
            <span class="dash">–</span>
            <DateInput id="task-due" value={task.due} disabled={!editable} onSave={(due) => save({ due })} ariaLabel={t('Due date')} />
          </div>
          <span class="hint">
            {nd != null && t('{n} working days', { n: nd })}
            {task.due && task.status !== 'done' && task.status !== 'na' && <> · {relDue(task.due, today)}</>}
            {task.status === 'done' && task.doneAt && <> · {t('done {d}', { d: fmtDate(task.doneAt) })}</>}
          </span>
        </div>
        <div class="prop">
          <label for="task-prio">{t('Priority')}</label>
          <select id="task-prio" value={task.priority || 'normal'} disabled={!editable} onChange={(e) => save({ priority: e.currentTarget.value })}>
            <option value="high">{t('High')}</option>
            <option value="normal">{t('Normal')}</option>
            <option value="low">{t('Low')}</option>
          </select>
        </div>
        <div class="prop">
          <span class="lbl">{t('Milestone')}</span>
          <label class="toggle">
            <input id="task-ms" type="checkbox" checked={!!task.milestone} disabled={!editable} onChange={(e) => save({ milestone: e.currentTarget.checked })} />
            <span>{t('Show as a milestone in the timeline')}</span>
          </label>
        </div>
      </div>

      <div class="block">
        <label for="task-desc">{t('Description')}</label>
        <EditText id="task-desc" multiline rows={3} value={task.description} disabled={!editable} placeholder={t('What needs to be done, and why?')} onSave={(description) => save({ description })} />
      </div>
      <div class="block">
        <label for="task-dod">{t('Definition of Done')}</label>
        <EditText id="task-dod" multiline rows={2} value={task.dod} disabled={!editable} placeholder={t('How do we know the task is done? E.g. a decision, a document, a list.')} onSave={(dod) => save({ dod })} />
      </div>

      <div class="block">
        <span class="lbl">{t('Dependencies')}</span>
        {deps.length > 0 && (
          <ul class="deps">
            {deps.map((d) => (
              <li>
                <button type="button" class="link-btn" onClick={() => openTask(d.id)}>
                  {d.title}
                </button>
                <StatusPill value={d.status} />
                {editable && (
                  <button type="button" class="icon-btn small" aria-label={t('Remove dependency')} onClick={() => save({ dependsOn: (task.dependsOn || []).filter((x) => x !== d.id) })}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && candidates.length > 0 && (
          <select
            id="task-dep-add"
            class="dep-add"
            value=""
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v) save({ dependsOn: [...(task.dependsOn || []), v] });
              e.currentTarget.value = '';
            }}
          >
            <option value="">{t('+ Add a task that must be done first…')}</option>
            {wss.map((w) => {
              const opts = candidates.filter((c) => c.workstreamId === w.id);
              return opts.length ? (
                <optgroup label={w.name}>
                  {opts.map((c) => (
                    <option value={c.id}>{c.title}</option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        )}
        {!deps.length && !editable && <p class="muted small">{t('No dependencies.')}</p>}
        {blocking.length > 0 && (
          <p class="small muted blocks">
            {t('Waiting for this task:')}{' '}
            {blocking.map((b, i) => (
              <>
                {i > 0 && ', '}
                <button type="button" class="link-btn" onClick={() => openTask(b.id)}>
                  {b.title}
                </button>
              </>
            ))}
          </p>
        )}
      </div>

      <section class="activity">
        <h3>{t('Comments and history')}</h3>
        {canEdit() && (
          <div class="comment-box">
            <textarea
              id="task-comment"
              rows={2}
              value={comment}
              placeholder={t('Write an update, a decision or what is blocking…')}
              onInput={(e) => setComment(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendComment();
              }}
            />
            <button class="btn primary small" disabled={!comment.trim() || sending} onClick={sendComment}>
              {t('Comment')}
            </button>
          </div>
        )}
        {S.historyLoaded[task.projectId] ? <EventList events={events} limit={30} /> : <p class="muted small">{t('Loading history…')}</p>}
      </section>

      <footer class="drawer-foot">
        <span class="small muted">
          {t('Created {d}', { d: fmtDateTime(task.createdAt) })}
          {task.createdBy && ` ${t('by')} ${actorName(task.createdBy)}`}
          {task.updatedAt && task.updatedAt !== task.createdAt && (
            <>
              {' · '}
              {t('Last changed {d}', { d: fmtDateTime(task.updatedAt) })}
              {task.updatedBy && ` ${t('by')} ${actorName(task.updatedBy)}`}
            </>
          )}
        </span>
        {editable && (
          <button class="btn ghost danger small" onClick={onDelete}>
            <Icon name="trash" size={14} /> {t('Delete')}
          </button>
        )}
      </footer>
    </div>
  );
}
