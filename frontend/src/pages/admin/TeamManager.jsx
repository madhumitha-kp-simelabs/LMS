import { useState } from 'react';
import { Badge, Button, Card, Input } from '../../components/ui';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Adding, renaming and removing the teams candidates are trained under.
 *
 * Lives on the Candidates tab rather than getting a screen of its own, for the
 * same reason the category manager lives on the catalogue: nobody sets out to
 * "manage teams", they notice a missing one while filing somebody, and the fix
 * should be where they noticed.
 */
export default function TeamManager({ teams, busy, onAdd, onRename, onRemove }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);

  async function add(event) {
    event.preventDefault();
    if (!name.trim()) return;
    const added = await onAdd(name.trim());
    if (added) setName('');
  }

  const unassigned = teams.reduce((sum, team) => sum + team.members, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Teams</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            What each candidate is being trained as — MERN, Python, Project Management.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setOpen((was) => !was)}>
          {open ? 'Done' : 'Manage'}
        </Button>
      </div>

      {/* Closed, it is a row of chips: enough to see what exists without the
          machinery for changing it sitting on screen all day. */}
      {!open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {teams.length === 0 ? (
            <p className="text-sm text-slate-500">
              None yet. Add MERN, Python and the rest with Manage.
            </p>
          ) : (
            teams.map((team) => (
              <Badge key={team.id} tone="violet">
                {team.name} · {team.members}
              </Badge>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {teams.map((team) =>
              team.id === editingId ? (
                <RenameRow
                  key={team.id}
                  team={team}
                  busy={busy}
                  onCancel={() => setEditingId(null)}
                  onSave={async (next) => {
                    const saved = await onRename(team, next);
                    if (saved) setEditingId(null);
                  }}
                />
              ) : (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-slate-900">{team.name}</span>
                    <span className="text-xs text-slate-500">
                      {team.members === 0 ? 'nobody yet' : plural(team.members, 'candidate')}
                    </span>
                  </span>

                  <span className="flex gap-3">
                    <button
                      disabled={busy}
                      onClick={() => setEditingId(team.id)}
                      className="text-xs text-indigo-600 underline hover:text-indigo-700 disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onRemove(team)}
                      title={
                        team.members > 0
                          ? `${plural(team.members, 'candidate')} would become unassigned`
                          : undefined
                      }
                      className="text-xs text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>

          <form onSubmit={add} className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <Input
                label="New team"
                placeholder="Data Engineering"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add team'}
            </Button>
          </form>

          <p className="text-xs leading-relaxed text-slate-500">
            Removing a team never removes its people — they become unassigned and can be filed
            again. {unassigned > 0 && `${plural(unassigned, 'candidate')} filed so far.`}
          </p>
        </div>
      )}
    </Card>
  );
}

/** Renaming in place. The slug follows the name, so typos do not outlive them. */
function RenameRow({ team, busy, onSave, onCancel }) {
  const [name, setName] = useState(team.name);
  const changed = name.trim() && name.trim() !== team.name;

  return (
    <li className="py-2.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) onSave(name.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="w-64">
          <Input
            label="Name"
            autoFocus
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !changed}>
          Save
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </form>
    </li>
  );
}
