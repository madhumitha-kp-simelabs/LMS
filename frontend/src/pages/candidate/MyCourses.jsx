import { useCallback, useEffect, useState } from 'react';
import { api, openMaterial } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, formatBytes } from '../../components/ui';
import TopicQuiz from './TopicQuiz';

export default function MyCourses() {
  const [courses, setCourses] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Also called after a quiz is scored, to refresh the sidebar score badges.
  const loadCourses = useCallback(
    () =>
      api('/learn/my-courses')
        .then(({ courses }) => {
          setCourses(courses);
          setSelectedTopicId((current) => current ?? courses[0]?.topics[0]?.id ?? null);
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    loadCourses().finally(() => setLoading(false));
  }, [loadCourses]);

  useEffect(() => {
    if (!selectedTopicId) return;
    setTopic(null);
    api(`/learn/topics/${selectedTopicId}`)
      .then(({ topic }) => setTopic(topic))
      .catch((err) => setError(err.message));
  }, [selectedTopicId]);

  if (loading) return <p className="text-sm text-slate-500">Loading your courses…</p>;

  if (courses.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My courses</h1>
        <div className="mt-6">
          <Empty>
            Nothing has been allotted to you yet. Your trainer will share course material when
            it&apos;s ready.
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">My courses</h1>
      <Alert>{error}</Alert>

      <div className="mt-8 grid gap-10 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-7">
          {courses.map((course) => (
            <div key={course.id}>
              <p className="text-base font-semibold tracking-wide text-indigo-600">{course.code}</p>
              <h2 className="mb-2 text-sm font-medium text-slate-700">{course.title}</h2>

              <nav className="space-y-2">
                {course.topics.map((t) => {
                  const active = t.id === selectedTopicId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTopicId(t.id)}
                      className={`w-full rounded-xl border px-4 py-3.5 text-left transition ${
                        active
                          ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-baseline gap-2.5">
                        <span className="text-xs text-slate-400">{t.position}</span>
                        <span className="text-sm font-medium leading-snug text-slate-900">
                          {t.title}
                        </span>
                      </div>
                      <p className="mt-1.5 pl-6 text-xs text-slate-500">
                        {t.materialCount} file{t.materialCount === 1 ? '' : 's'}
                        {t.hasQuiz && (t.latestScore === null ? ' · quiz to do' : ` · ${t.latestScore}%`)}
                      </p>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </aside>

        <section>
          {!topic ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="space-y-6">
              <Card>
                <h2 className="text-lg font-semibold text-slate-900">{topic.title}</h2>
                {topic.description && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{topic.description}</p>
                )}
              </Card>

              <Card accent="sky">
                <h3 className="text-lg font-semibold text-slate-900">Material</h3>
                <div className="mt-4 space-y-2">
                  {topic.materials.length === 0 ? (
                    <Empty>No material has been added to this topic yet.</Empty>
                  ) : (
                    topic.materials.map((material) => (
                      <div
                        key={material.id}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge tone="sky">{material.type === 'pdf' ? 'PDF' : 'Slides'}</Badge>
                            <span className="truncate text-sm font-medium text-slate-900">
                              {material.title}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatBytes(material.fileSizeBytes)}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            openMaterial(material.id).catch((e) => setError(e.message))
                          }
                        >
                          Open
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <TopicQuiz topicId={topic.id} onScored={loadCourses} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
