import syllabus from "../syllabus.json";

export const jeeSyllabus = syllabus;

export type SyllabusSubject = (typeof jeeSyllabus.subjects)[number];
export type SyllabusSubjectId = SyllabusSubject["id"];
export type SyllabusSubjectName = SyllabusSubject["name"];
export type SyllabusChapter = SyllabusSubject["chapters"][number];
export type SyllabusTopic = SyllabusChapter["topics"][number];

export function getSubject(subjectId: string) {
  return jeeSyllabus.subjects.find((subject) => subject.id === subjectId);
}

export function getChapter(subjectId: string, chapterId: string) {
  return getSubject(subjectId)?.chapters.find(
    (chapter) => chapter.id === chapterId,
  );
}
