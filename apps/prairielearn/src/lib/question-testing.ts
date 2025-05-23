import jsonStringifySafe from 'json-stringify-safe';
import _ from 'lodash';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { insertGradingJob, updateGradingJobAfterGrading } from '../models/grading-job.js';
import { selectUserById } from '../models/user.js';
import * as questionServers from '../question-servers/index.js';

import {
  type Course,
  type CourseInstance,
  type Question,
  type Submission,
  SubmissionSchema,
  type Variant,
} from './db-types.js';
import { gradeVariant, insertSubmission, saveSubmission } from './grading.js';
import { writeCourseIssues } from './issues.js';
import { getAndRenderVariant } from './question-render.js';
import { ensureVariant, getQuestionCourse } from './question-variant.js';
import { type ServerJob, createServerJob } from './server-jobs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface TestResultStats {
  generateDuration: number;
  renderDuration: number;
  gradeDuration?: number;
}

interface TestQuestionResults {
  variant: Variant;
  expected_submission: Submission | null;
  test_submission: Submission | null;
  stats: TestResultStats;
}

type TestType = 'correct' | 'incorrect' | 'invalid';

/**
 * Internal worker for testVariant(). Do not call directly.
 * @protected
 *
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param variant_course - The course for the variant.
 * @param test_type - The type of test to run.
 * @param user_id - The current effective user.
 * @param authn_user_id - The currently authenticated user.
 * @returns The submission ID.
 */
async function createTestSubmission(
  variant: Variant,
  question: Question,
  variant_course: Course,
  test_type: TestType,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  const questionModule = questionServers.getModule(question.type);
  if (!questionModule.test) {
    throw new Error('Question type does not support testing, must be Freeform');
  }

  const question_course = await getQuestionCourse(question, variant_course);
  const { courseIssues, data } = await questionModule.test(
    variant,
    question,
    question_course,
    test_type,
  );
  const hasFatalIssue = courseIssues.some((issue) => issue.fatal);

  const studentMessage = 'Error creating test submission';
  const courseData = { variant, question, course: variant_course };
  await writeCourseIssues(
    courseIssues,
    variant,
    user_id,
    authn_user_id,
    studentMessage,
    courseData,
  );

  if (hasFatalIssue) data.gradable = false;

  // We discard the returned updated variant here. We don't need it later in
  // this function, and the caller of this function will re-select the variant
  // before grading the submission.
  const { submission_id } = await insertSubmission({
    submitted_answer: {},
    raw_submitted_answer: data.raw_submitted_answer,
    format_errors: data.format_errors,
    gradable: data.gradable,
    broken: hasFatalIssue,
    // The `test` phase is not allowed to mutate `params` and `true_answers`, so
    // we just pick the original `params` and `true_answer` so we can use our
    // standard `insertSubmission`.
    params: variant.params,
    true_answer: variant.true_answer,
    feedback: null,
    credit: null,
    mode: null,
    variant_id: variant.id,
    user_id,
    auth_user_id: authn_user_id,
    client_fingerprint_id: null,
  });

  const grading_job = await insertGradingJob({ submission_id, authn_user_id });

  await updateGradingJobAfterGrading({
    grading_job_id: grading_job.id,
    submitted_answer: {},
    format_errors: data.format_errors,
    gradable: data.gradable,
    broken: hasFatalIssue,
    params: data.params,
    true_answer: data.true_answer,
    feedback: {},
    partial_scores: data.partial_scores,
    score: data.score,
  });

  return submission_id;
}

/**
 * Internal worker for testVariant(). Do not call directly.
 * @protected
 *
 * @param expected_submission - Generated reference submission data.
 * @param test_submission - Computed submission to be tested.
 * @returns A list of errors encountered during comparison.
 */
function compareSubmissions(expected_submission: Submission, test_submission: Submission): Error[] {
  const courseIssues: Error[] = [];

  const checkEqual = (name, var1, var2) => {
    const json1 = jsonStringifySafe(var1);
    const json2 = jsonStringifySafe(var2);
    if (!_.isEqual(var1, var2)) {
      courseIssues.push(new Error(`"${name}" mismatch: expected "${json1}" but got "${json2}"`));
    }
  };

  if (expected_submission.broken) {
    courseIssues.push(new Error('expected_submission is broken, skipping tests'));
    return courseIssues;
  }
  if (test_submission.broken) {
    courseIssues.push(new Error('test_submission is broken, skipping tests'));
    return courseIssues;
  }
  checkEqual('gradable', expected_submission.gradable, test_submission.gradable);
  checkEqual(
    'format_errors keys',
    Object.keys(expected_submission.format_errors ?? {}),
    Object.keys(test_submission.format_errors ?? {}),
  );
  if (!test_submission.gradable || !expected_submission.gradable) {
    return courseIssues;
  }
  checkEqual('partial_scores', expected_submission.partial_scores, test_submission.partial_scores);
  checkEqual('score', expected_submission.score, test_submission.score);
  return courseIssues;
}

/**
 * Internal worker for _testQuestion(). Do not call directly.
 * Tests a question variant. Issues will be inserted into the issues table.
 * @protected
 *
 * @param variant - The variant to submit to.
 * @param question - The question for the variant.
 * @param course - The course for the variant.
 * @param test_type - The type of test to run.
 * @param user_id - The current effective user.
 * @param authn_user_id - The currently authenticated user.
 */
async function testVariant(
  variant: Variant,
  question: Question,
  course: Course,
  test_type: TestType,
  user_id: string,
  authn_user_id: string,
): Promise<{ expected_submission: Submission; test_submission: Submission }> {
  const expected_submission_id = await createTestSubmission(
    variant,
    question,
    course,
    test_type,
    user_id,
    authn_user_id,
  );
  const expected_submission = await selectSubmission(expected_submission_id);

  const submission_data = {
    variant_id: variant.id,
    user_id,
    auth_user_id: authn_user_id,
    submitted_answer: expected_submission.raw_submitted_answer || {},
  };
  const { submission_id: test_submission_id, variant: updated_variant } = await saveSubmission(
    submission_data,
    variant,
    question,
    course,
  );
  await gradeVariant(
    updated_variant,
    test_submission_id,
    question,
    course,
    user_id,
    authn_user_id,
    true,
  );
  const test_submission = await selectSubmission(test_submission_id);

  const courseIssues = compareSubmissions(expected_submission, test_submission);
  const studentMessage = 'Question test failure';
  const courseData = {
    variant: updated_variant,
    question,
    course,
    expected_submission,
    test_submission,
  };
  await writeCourseIssues(
    courseIssues,
    variant,
    user_id,
    authn_user_id,
    studentMessage,
    courseData,
  );
  return { expected_submission, test_submission };
}

/**
 * Test a question. Issues will be inserted into the issues table.
 *
 * @param question - The question for the variant.
 * @param variant_course - The course for the variant.
 * @param authn_user_id - The currently authenticated user.
 * @param test_type - The type of test to run.
 */
async function testQuestion(
  question: Question,
  course_instance: CourseInstance | null,
  variant_course: Course,
  test_type: TestType,
  authn_user_id: string,
  user_id: string,
): Promise<TestQuestionResults> {
  let generateDuration;
  let renderDuration;
  let gradeDuration;

  let variant;
  let expected_submission: Submission | null = null;
  let test_submission: Submission | null = null;

  const question_course = await getQuestionCourse(question, variant_course);
  const instance_question_id = null;
  const course_instance_id = (course_instance && course_instance.id) || null;
  const options = {};
  const require_open = true;
  const client_fingerprint_id = null;
  const generateStart = Date.now();
  try {
    variant = await ensureVariant(
      question.id,
      instance_question_id,
      authn_user_id,
      authn_user_id,
      course_instance_id,
      variant_course,
      question_course,
      options,
      require_open,
      client_fingerprint_id,
    );
  } finally {
    const generateEnd = Date.now();
    generateDuration = generateEnd - generateStart;
  }

  const renderStart = Date.now();
  try {
    const user = await selectUserById(user_id);
    const authn_user = await selectUserById(authn_user_id);
    await getAndRenderVariant(variant.id, null, {
      question,
      course: variant_course,
      urlPrefix: `/pl/course/${variant_course.id}`,
      user,
      authn_user,
      is_administrator: false,
    });
  } finally {
    const renderEnd = Date.now();
    renderDuration = renderEnd - renderStart;
  }

  if (!variant.broken_at) {
    const gradeStart = Date.now();
    try {
      ({ expected_submission, test_submission } = await testVariant(
        variant,
        question,
        variant_course,
        test_type,
        user_id,
        authn_user_id,
      ));
    } finally {
      const gradeEnd = Date.now();
      gradeDuration = gradeEnd - gradeStart;
    }
  }

  const stats = { generateDuration, renderDuration, gradeDuration };
  return { variant, expected_submission, test_submission, stats };
}

/**
 * Internal worker for _testQuestion(). Do not call directly.
 * Runs a single test.
 * @protected
 *
 * @param logger - The server job to run within.
 * @param showDetails - Whether to display test data details.
 * @param question - The question for the variant.
 * @param course - The course for the variant.
 * @param test_type - The type of test to run.
 * @param user_id - The current effective user.
 * @param authn_user_id - The currently authenticated user.
 */
async function runTest(
  logger: ServerJob,
  showDetails: boolean,
  question: Question,
  course_instance: CourseInstance | null,
  course: Course,
  test_type: TestType,
  user_id: string,
  authn_user_id: string,
): Promise<{ success: boolean; stats: TestResultStats }> {
  logger.verbose('Testing ' + question.qid);
  const { variant, expected_submission, test_submission, stats } = await testQuestion(
    question,
    course_instance,
    course,
    test_type,
    authn_user_id,
    user_id,
  );

  if (showDetails) {
    const variantKeys = ['broken_at', 'options', 'params', 'true_answer', 'variant_seed'];
    const submissionKeys = [
      'broken',
      'correct',
      'feedback',
      'format_errors',
      'gradable',
      'grading_method',
      'partial_scores',
      'raw_submitted_answer',
      'score',
      'submitted_answer',
      'true_answer',
    ];
    logger.verbose('variant:\n' + jsonStringifySafe(_.pick(variant, variantKeys), null, '    '));
    if (expected_submission) {
      logger.verbose(
        'expected_submission:\n' +
          jsonStringifySafe(_.pick(expected_submission, submissionKeys), null, '    '),
      );
    }
    if (test_submission) {
      logger.verbose(
        'test_submission:\n' +
          jsonStringifySafe(_.pick(test_submission, submissionKeys), null, '    '),
      );
    }
  }

  const issueCount = await sqldb.queryRow(
    sql.select_issue_count_for_variant,
    { variant_id: variant.id },
    z.number(),
  );

  if (issueCount > 0) {
    logger.verbose(`ERROR: ${issueCount} issues encountered during test.`);
  } else {
    logger.verbose('Success: no issues during test');
  }

  return { success: issueCount === 0, stats };
}

/**
 * Start a job sequence to test a question.
 *
 * @param count - The number of times to test, will run each possible test ('correct, 'incorrect,' invalid') this many times.
 * @param showDetails - Whether to display test data details.
 * @param question - The question for the variant.
 * @param course_instance - The course instance for the variant; may be null for instructor questions
 * @param course - The course for the variant.
 * @param user_id - The current effective user.
 * @param authn_user_id - The currently authenticated user.
 * @return The job sequence ID.
 */
export async function startTestQuestion(
  count: number,
  showDetails: boolean,
  question: Question,
  course_instance: CourseInstance | null,
  course: Course,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  let success = true;
  const test_types: TestType[] = ['correct', 'incorrect', 'invalid'] as const;

  const serverJob = await createServerJob({
    courseId: course.id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'test_question',
    description: 'Test ' + question.qid,
  });

  const stats: TestResultStats[] = [];

  serverJob.executeInBackground(async (job) => {
    for (const iter of Array(count * test_types.length).keys()) {
      const type = test_types[iter % test_types.length];
      job.verbose(`Test ${Math.floor(iter / test_types.length) + 1}, type ${type}`);
      const result = await runTest(
        job,
        showDetails,
        question,
        course_instance,
        course,
        type,
        user_id,
        authn_user_id,
      );
      success = success && result.success;
      if (result.stats) {
        stats.push(result.stats);
      }
    }

    function printStats(label: string, key: keyof TestResultStats) {
      let min = Number.MAX_SAFE_INTEGER;
      let max = 0;
      let count = 0;
      let sum = 0;
      stats.forEach((stat) => {
        const value = stat[key];
        if (value == null) return;
        count += 1;
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      });

      if (count === 0) {
        job.verbose(`${label} No data`);
        return;
      }

      const avg = Math.round((sum / count) * 100) / 100;
      job.info(`${label} ${count} tests, min ${min}ms, avg ${avg}ms, max ${max}ms`);
    }

    printStats('Generate/prepare:', 'generateDuration');
    printStats('Render:          ', 'renderDuration');
    printStats('Parse/grade:     ', 'gradeDuration');

    if (!success) {
      throw new Error('Some tests failed. See the "Issues" page for details.');
    }
  });

  return serverJob.jobSequenceId;
}

async function selectSubmission(submission_id: string): Promise<Submission> {
  return await sqldb.queryRow(sql.select_submission_by_id, { submission_id }, SubmissionSchema);
}
