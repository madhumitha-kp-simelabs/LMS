import { useCallback, useEffect, useState } from 'react';
import { api, openMaterial } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, formatBytes } from '../../components/ui';
import TopicQuiz from './TopicQuiz';
import { groupByCategory } from '../../lib/categories';
import CategoryHeading from '../../components/CategoryHeading';

/**
 * A topic is finished when its quiz has been sat, and not before.
 *
 * Reading the material is not something the system can witness, so it cannot be
 * the test — the quiz is the one moment a candidate demonstrably did the work.
 * A topic with no published quiz has nothing to finish, which is why it counts
 * as neither done nor outstanding anywhere.
 */
const isDone = (topic) => topic.hasQuiz && topic.latestScore !== null;

/** Where "Start" and "Continue" send you: the first thing left to do. */
const nextUp = (course) => course.topics.find((t) => !isDone(t)) ?? course.topics[0];

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
          // Deliberately does not pick a topic. Opening every course's topics
          // at once put five or ten rows on screen before the candidate had
          // chosen anything, which is what made the column unreadable — you
          // press Start on one course, and that is the course you see.
          //
          // A topic already open stays open across a refresh, so being scored
          // does not throw you back to the list.
          setSelectedTopicId((current) =>
            current && courses.some((c) => c.topics.some((t) => t.id === current)) ? current : null,
          );
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

  // Which course the open topic belongs to, and where in it. The sidebar reads
  // it to decide which course is expanded; the pane reads it to say "Topic 2 of
  // 5" and to know what comes next.
  const openCourse = courses.find((c) => c.topics.some((t) => t.id === selectedTopicId));
  const openIndex = openCourse?.topics.findIndex((t) => t.id === selectedTopicId) ?? -1;
  const openSummary = openIndex >= 0 ? openCourse.topics[openIndex] : null;
  const previousTopic = openIndex > 0 ? openCourse.topics[openIndex - 1] : null;
  const nextTopic =
    openIndex >= 0 && openIndex < openCourse.topics.length - 1
      ? openCourse.topics[openIndex + 1]
      : null;

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
        {/*
          A rail, not a stack of cards.
          
          Every topic used to be a bordered, shadowed box with its own padding,
          which put four competing frames on screen — category, course, topic
          card, and the real content card to the right — and left the column
          feeling packed while saying very little. Topics are one list under one
          course; a shared left rule says that, and the only topic that needs a
          box is the one you are reading.
        */}
        <aside className="space-y-8">
          {groupByCategory(courses).map((group) => (
            <div key={group.category.id ?? 'none'} className="space-y-6">
              <CategoryHeading category={group.category} />

              {group.courses.map((course) => (
                <div key={course.id}>
                  {/* Code and title on one line: two stacked headings for one
                      course was a level of hierarchy that does not exist. */}
                  <h2 className="flex flex-wrap items-baseline gap-x-2 px-1">
                    <span className="text-xs font-semibold tracking-wide text-indigo-600">
                      {course.code}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{course.title}</span>
                  </h2>

                  <CourseProgress
                    course={course}
                    open={course.id === openCourse?.id}
                    onStart={() =>
                      setSelectedTopicId(
                        course.id === openCourse?.id ? null : (nextUp(course)?.id ?? null),
                      )
                    }
                  />

                  {course.id === openCourse?.id && (
                  <nav className="mt-2 border-l border-slate-200">
                    {course.topics.map((t) => {
                      const active = t.id === selectedTopicId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTopicId(t.id)}
                          // The rule is redrawn in indigo under the active row,
                          // so the rail itself points at where you are.
                          className={`-ml-px w-full border-l-2 py-2.5 pl-3.5 pr-2 text-left transition ${
                            active
                              ? 'border-indigo-500 bg-indigo-50/70'
                              : 'border-transparent hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-baseline gap-2.5">
                            {/* The tick takes the number's place rather than
                                sitting beside it — same column, so the titles
                                stay aligned whatever state each topic is in. */}
                            <span
                              className={`w-4 shrink-0 text-right text-xs tabular-nums ${
                                isDone(t)
                                  ? 'text-emerald-600'
                                  : active
                                    ? 'text-indigo-500'
                                    : 'text-slate-400'
                              }`}
                              title={isDone(t) ? 'Finished' : undefined}
                            >
                              {isDone(t) ? '✓' : t.position}
                            </span>
                            <span
                              className={`text-sm leading-snug ${
                                active ? 'font-semibold text-indigo-900' : 'text-slate-700'
                              }`}
                            >
                              {t.title}
                            </span>
                          </span>

                          {/* Only when there is something to say. "0 files"
                              under every untouched topic was a column of the
                              same non-fact repeated down the page. */}
                          {(t.materialCount > 0 || t.hasQuiz) && (
                            <span className="mt-1 flex flex-wrap gap-x-1.5 pl-[1.625rem] text-xs text-slate-500">
                              {t.materialCount > 0 && (
                                <span>
                                  {t.materialCount} file{t.materialCount === 1 ? '' : 's'}
                                </span>
                              )}
                              {t.materialCount > 0 && t.hasQuiz && (
                                <span className="text-slate-300">·</span>
                              )}
                              {t.hasQuiz &&
                                (t.latestScore === null ? (
                                  <span className="font-medium text-amber-700">quiz to do</span>
                                ) : (
                                  <span className={t.latestScore >= 50 ? 'text-emerald-700' : 'text-rose-700'}>
                                    {t.latestScore}%
                                  </span>
                                ))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                  )}
                </div>
              ))}
            </div>
          ))}
        </aside>

        <section>
          {!selectedTopicId ? (
            <CoursePicker
              courses={courses}
              onStart={(course) => setSelectedTopicId(nextUp(course)?.id ?? null)}
            />
          ) : !topic ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="space-y-6">
              {/* Getting out. Without it the only way back to the list is
                  Hide topics in the sidebar, which is a long way from where
                  your eyes are. */}
              <button
                onClick={() => setSelectedTopicId(null)}
                className="text-sm text-indigo-600 transition hover:text-indigo-700"
              >
                ← All my courses
              </button>

              <Card>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    {openCourse && (
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {openCourse.code} · Topic {openIndex + 1} of {openCourse.topics.length}
                      </p>
                    )}
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">{topic.title}</h2>
                  </div>

                  {openSummary && isDone(openSummary) && (
                    <Badge tone="green">✓ Finished</Badge>
                  )}
                </div>

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

              {openCourse && (
                <TopicStep
                  current={openSummary}
                  previous={previousTopic}
                  next={nextTopic}
                  onGo={setSelectedTopicId}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * How far through a course you are, and the button that takes you back to it.
 *
 * "Start" and "Continue" are the same control wearing two labels: both go to
 * the first unfinished topic. Splitting them into two behaviours would mean a
 * candidate who left halfway and came back got sent to the beginning.
 */
function CourseProgress({ course, open, onStart }) {
  const { doneTopics, gradedTopics } = course;
  const finished = gradedTopics > 0 && doneTopics === gradedTopics;
  const percent = gradedTopics === 0 ? 0 : Math.round((doneTopics / gradedTopics) * 100);

  return (
    <div className="mt-2 px-1">
      {gradedTopics > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <span
              className={`block h-full rounded-full transition-[width] duration-500 ${
                finished ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </span>
          <span
            className={`shrink-0 text-xs tabular-nums ${
              finished ? 'font-medium text-emerald-700' : 'text-slate-500'
            }`}
          >
            {doneTopics}/{gradedTopics}
          </span>
        </div>
      )}

      <Button
        variant={open ? 'subtle' : finished ? 'secondary' : 'primary'}
        size="sm"
        className="mt-2 w-full"
        onClick={onStart}
      >
        {/* One button, four states. Once the course is open its topics are
            right underneath, so the useful thing it can offer is putting them
            away again. A finished course still opens — going back over it is
            normal, and a dead control would say otherwise. */}
        {open
          ? 'Hide topics'
          : finished
            ? 'Review course'
            : course.startedAt
              ? 'Continue'
              : 'Start course'}
      </Button>
    </div>
  );
}

/**
 * Moving between topics, at the foot of the one you are on.
 *
 * The nudge is the point. A candidate who has just been scored is at the moment
 * they are most likely to carry on, and until now the page left them staring at
 * their result with nothing to press — the only way forward was back to the
 * sidebar to hunt for the next line.
 *
 * Nothing is locked. The quiz decides whether a topic counts as finished, not
 * whether the next one may be opened: barring someone from reading ahead
 * because they have not sat a test is a different product from this one.
 */
function TopicStep({ current, previous, next, onGo }) {
  const done = current ? isDone(current) : false;

  return (
    <Card className={done && next ? 'border-emerald-200 bg-emerald-50/40' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          {!next ? (
            <p className="text-sm text-slate-600">
              {done
                ? 'That was the last topic on this course. Nothing left to do.'
                : 'Last topic on this course.'}
            </p>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {done ? 'Finished — up next' : 'Up next'}
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{next.title}</p>
              {/* Said once, quietly, and never as a barrier. */}
              {!done && current?.hasQuiz && (
                <p className="mt-0.5 text-xs text-amber-700">
                  Take this topic&apos;s quiz to mark it finished.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {previous && (
            <Button variant="secondary" size="sm" onClick={() => onGo(previous.id)}>
              ← Previous
            </Button>
          )}
          {next && (
            // Primary once the topic is behind you, so the obvious button is
            // the one that matches what you have actually finished.
            <Button
              variant={done ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onGo(next.id)}
            >
              Next topic →
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * What fills the pane before a course is opened.
 *
 * The alternative was an empty column and a sentence telling you to look left,
 * which wastes the largest area on the page at the one moment the candidate has
 * not yet decided anything. This is the deciding screen: what each course is,
 * how far in you are, and the way in.
 */
function CoursePicker({ courses, onStart }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Pick up where you left off</h2>
        <p className="mt-1 text-sm text-slate-500">
          {courses.length === 1
            ? 'Open your course to work through its topics.'
            : `You are on ${courses.length} courses. Open one to work through its topics.`}
        </p>
      </div>

      {courses.map((course) => {
        const finished = course.gradedTopics > 0 && course.doneTopics === course.gradedTopics;
        const percent =
          course.gradedTopics === 0
            ? 0
            : Math.round((course.doneTopics / course.gradedTopics) * 100);

        return (
          <Card key={course.id} accent={finished ? 'emerald' : 'indigo'}>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-indigo-600">
                    {course.code}
                  </span>
                  {finished && <Badge tone="green">Finished</Badge>}
                </div>

                <h3 className="mt-1 font-semibold text-slate-900">{course.title}</h3>

                {course.description && (
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
                    {course.description}
                  </p>
                )}

                <p className="mt-2 text-xs text-slate-500">
                  {course.topics.length} topic{course.topics.length === 1 ? '' : 's'}
                  {course.gradedTopics > 0 && ` · ${course.doneTopics} of ${course.gradedTopics} done`}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <Button variant={finished ? 'secondary' : 'primary'} onClick={() => onStart(course)}>
                  {finished ? 'Review course' : course.startedAt ? 'Continue' : 'Start course'}
                </Button>

                {course.gradedTopics > 0 && (
                  <span className="mt-2 block h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
                    <span
                      className={`block h-full rounded-full ${
                        finished ? 'bg-emerald-500' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
