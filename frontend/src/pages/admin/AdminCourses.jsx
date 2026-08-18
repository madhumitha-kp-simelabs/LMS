import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Cell, Empty, Input, Row, Table } from '../../components/ui';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The course catalogue: what courses exist, and what they are called.
 *
 * Creating one takes a code and a title and nothing else. Who runs it is
 * decided on the allotment page; the trainer allotted to it then fills in the
 * duration, description, topics, material and quizzes.
 */
export default function AdminCourses() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api('/courses')
        .then(({ courses }) => setCourses(courses))
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function create({ code, title }) {
    setBusy(true);
    setNotice(null);
    try {
      await api('/admin/courses', { method: 'POST', body: { code, title } });
      await load();
      setNotice({ tone: 'indigo', text: `${code} added. Allot it to a trainer when you are ready.` });
      return true;
    } catch (err) {
      setNotice({
        tone: 'rose',
        // A 422 carries the per-field reasons; "Validation failed" on its own
        // says nothing about which box is wrong.
        text: err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <Heading />
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      </div>
    );
  }

  if (!courses) return <p className="text-sm text-slate-500">Loading courses…</p>;

  const unallotted = courses.filter((c) => !c.owner).length;

  return (
    <div>
      <Heading />

      <div className="mt-8 space-y-6">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        <NewCourseForm busy={busy} onCreate={create} />

        <section>
          <h2 className="text-lg font-semibold text-slate-900">All courses</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {plural(courses.length, 'course')}
            {unallotted > 0 && (
              <>
                {' · '}
                <Link to="/admin/allotment" className="font-medium text-amber-700 hover:underline">
                  {unallotted} waiting to be allotted
                </Link>
              </>
            )}
          </p>

          <div className="mt-4">
            <CourseTable courses={courses} />
          </div>
        </section>
      </div>
    </div>
  );
}

const Heading = () => (
  <div>
    <h1 className="text-2xl font-semibold text-slate-900">Courses</h1>
    <p className="mt-1 text-sm text-slate-500">
      Add a course with its code and title. Allotting it to a trainer is the next step, and the
      trainer builds out the topics, material and quizzes from there.
    </p>
  </div>
);

function NewCourseForm({ busy, onCreate }) {
  const [form, setForm] = useState({ code: '', title: '' });

  async function handleSubmit(event) {
    event.preventDefault();
    const added = await onCreate(form);
    if (added) setForm({ code: '', title: '' });
  }

  return (
    <Card accent="indigo">
      <h2 className="text-lg font-semibold text-slate-900">Add a course</h2>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <Input
          label="Course code"
          placeholder="PM-103"
          required
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })}
        />
        <Input
          label="Title"
          placeholder="Advanced Project Management"
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add course'}
        </Button>
      </form>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Codes are unique and shown to candidates — letters, numbers and hyphens, and the trainer can
        correct one later. The course starts as a draft, hidden from candidates until published.
      </p>
    </Card>
  );
}

function CourseTable({ courses }) {
  if (courses.length === 0) return <Empty>No courses yet. Add the first one above.</Empty>;

  return (
    <Table
      headers={[
        { label: 'Course' },
        { label: 'Trainer' },
        { label: 'Topics', align: 'right' },
        { label: 'Candidates', align: 'right' },
        { label: 'Status' },
      ]}
    >
      {courses.map((course) => (
        <Row key={course.id}>
          <Cell>
            <Link to={`/trainer/courses/${course.id}`} className="group">
              <span className="block text-xs font-semibold tracking-wide text-indigo-600">
                {course.code}
              </span>
              <span className="font-medium text-slate-900 group-hover:text-indigo-700">
                {course.title}
              </span>
            </Link>
          </Cell>
          <Cell>
            {course.owner ? (
              <span className="text-slate-700">{course.owner.fullName}</span>
            ) : (
              <Badge tone="amber">Not allotted</Badge>
            )}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {course._count.topics}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {course._count.enrollments}
          </Cell>
          <Cell>
            <Badge tone={course.isPublished ? 'green' : 'amber'}>
              {course.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </Cell>
        </Row>
      ))}
    </Table>
  );
}
