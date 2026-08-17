import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, Input, Textarea } from '../../components/ui';

export default function CourseList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', description: '', durationWeeks: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const { courses } = await api('/courses');
      setCourses(courses);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await api('/courses', {
        method: 'POST',
        body: {
          ...form,
          // An empty box means "not set", not zero.
          durationWeeks: form.durationWeeks ? Number(form.durationWeeks) : null,
        },
      });
      setForm({ code: '', title: '', description: '', durationWeeks: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading courses…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">My courses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a course, add topics, upload material, and allot candidates.
          </p>
        </div>
        <Button onClick={() => setShowForm((open) => !open)}>
          {showForm ? 'Cancel' : 'New course'}
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        <Alert>{error}</Alert>

        {showForm && (
          <Card>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[160px_1fr_150px]">
                <Input
                  label="Course code"
                  placeholder="PM-102"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
                <Input
                  label="Title"
                  placeholder="Advanced Project Management"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <Input
                  label="Duration (weeks)"
                  type="number"
                  min={1}
                  max={104}
                  placeholder="Optional"
                  value={form.durationWeeks}
                  onChange={(e) => setForm({ ...form, durationWeeks: e.target.value })}
                />
              </div>
              <Textarea
                label="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create course'}
              </Button>
            </form>
          </Card>
        )}

        {courses.length === 0 ? (
          <Empty>No courses yet. Create your first one to get started.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <Link key={course.id} to={`/trainer/courses/${course.id}`}>
                <Card
                  accent="indigo"
                  className="h-full transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-wide text-indigo-600">
                        {course.code}
                      </p>
                      <h2 className="mt-0.5 font-semibold text-slate-900">{course.title}</h2>
                    </div>
                    <Badge tone={course.isPublished ? 'green' : 'amber'}>
                      {course.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  {course.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{course.description}</p>
                  )}
                  <p className="mt-4 flex flex-wrap gap-x-3 text-xs">
                    <span className="text-violet-700">{course._count.topics} topics</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sky-700">{course._count.enrollments} candidates</span>
                    {course.durationWeeks && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-700">{course.durationWeeks} weeks</span>
                      </>
                    )}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
