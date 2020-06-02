const storage = require("electron-json-storage");
const smhw = require("node-smhw");
const fs = require("fs");
const cred = require("../login.json");
const https = require("https");

const remote = require("electron").remote;
const dialog = remote.dialog;

Promise.many = function (promises, cb) {
    const values = new Array(promises.length).fill();
    var d = 0;

    promises.forEach((promise, i) => {
        promise.then(function (value) {
            values[i] = value;

            if (++d === promises.length) {
                cb(values);
            }
        }).catch(function (err) {
            console.log(err);

            values[i] = null;
            
            if (++d === promises.length) {
                cb(values);
            }
        });
    });
}

/**
 * @type {smhw.Client}
 */
const client = new smhw.Client;

const _cache = {
    /**
     * @type {{ [key: String]: smhw.Teacher }}
     */
    teachers: {},
    
    /**
     * @type {{ [key: String]: smhw.ClassGroup }}
     */
    class_groups: {},
    
    /**
     * @type {{ [key: String]: smhw.User }} }}
     */
    users: {},
    
    /**
     * @type {{ [key: String]: smhw.Task }}
     */
    tasks: {},
    
    /**
     * @type {{ [key: String]: smhw.Submission }}
     */
    submissions: {},
    
    /**
     * @type {{ [key: String]: smhw.SubmissionComment }}
     */
    comments: {},
    
    /**
     * @type {{ [key: String]: smhw.Attachment }}
     */
    attachments: {},

    /**
     * @type {{ [key: String]: smhw.QuizQuestion }}
     */
    questions: {}
}

const filter = {
    title: document.querySelector("#filter-tasks-input"),
    regex: document.querySelector("#filter-tasks-regex"),
    description: document.querySelector("#filter-tasks-description"),
    class_group: document.querySelector("#filter-tasks-class-group"),
    subject: document.querySelector("#filter-tasks-subject"),
    teacher: document.querySelector("#filter-tasks-teacher"),
    show_past: document.querySelector("#filter-tasks-show-past")
}

/**
 * @type {smhw.Task}
 */
var selected_task = null;

/**
 * @type {smhw.Assignment}
 */
var selected_assignment = null;

/**
 * @type {smhw.Submission}
 */
var selected_submission = null;

function my_class_groups() {
    return Object.values(_cache.class_groups).filter(class_group => client.student.class_group_ids.indexOf(class_group.id) !== -1);
}

function my_teachers() {
    const my_class_groups_ = my_class_groups();
    const my_teachers = [];

    my_class_groups_.forEach(class_group => {
        my_teachers.push(...class_group.teacher_ids);
    });

    return Object.values(_cache.teachers).filter(teacher => my_teachers.indexOf(teacher.id) !== -1);
}

function task_layout1() {
    document.querySelector("#submission-list").style.display = "flex";
    document.querySelector("#task-section-attachments").style.display = "flex";
    document.querySelector("#task-section-questions").style.display = "none";

    document.querySelector("#task-section-information").style.gridArea = "1 / 2 / 1 / 2";
    document.querySelector("#task-section-submissions").style.gridArea = "3 / 1 / 3 / 2 span";

    document.querySelector("#submission-selected-title").innerHTML = "Selected";
}

function task_layout2() {
    document.querySelector("#submission-list").style.display = "none";
    document.querySelector("#task-section-attachments").style.display = "none";
    document.querySelector("#task-section-questions").style.display = "flex";

    document.querySelector("#task-section-information").style.gridArea = "3 / 2 / 3 / 2";
    document.querySelector("#task-section-submissions").style.gridArea = "3 / 1 / 3 / 1";

    document.querySelector("#submission-selected-title").innerHTML = "Submission";
}

function select_task(task) {
    const main_dash = document.querySelector("#app-page-dash");
    const task_page = document.querySelector("#app-page-task");
    const title = document.querySelector("#task-title");
    const description = document.querySelector("#task-description");

    main_dash.style.display = "none";
    task_page.style.display = "grid";

    selected_task = task;

    title.innerHTML = task.class_task_title;
    title.parentElement.className = "section-title-container task-title-" + task.class_task_type.toLowerCase();
    title.className = "section-title task-title-" + task.class_task_type.toLowerCase();
    description.innerHTML = task.description;

    if (task.class_task_type === "Quiz") {
        task_layout2();
        select_question(null);
    } else {
        task_layout1();
    }

    task.getAssignment().then(assignment => {
        selected_assignment = assignment;

        Promise.many([
            assignment.getSubmissions(),
            assignment.getSubmissionComments(),
            assignment.getAttachments()
        ], ([submissions, comments, attachments]) => {
            console.log(submissions, comments, attachments);

            if (submissions) submissions.forEach(submission => {
                _cache.submissions[submission.id] = submission;
            });

            if (comments) comments.forEach(comment => {
                _cache.comments[comment.id] = comment;
            });

            if (attachments) attachments.forEach(attachment => {
                _cache.attachments[attachment.id] = attachment;
            });

            if (task.class_task_type === "Quiz") {
                assignment.getQuestions().then(questions => {
                    if (questions) questions.forEach(question => {
                        _cache.questions[question.id] = question;
                    });

                    render_questions();
                });
            } else {
                render_submissions();
                render_attachments();
            }

            select_submission(submissions.filter(submission => submission.student_id === client.student.id)[0] || null);
        });
    }).catch(console.log);
}

function task_back() {
    const main_dash = document.querySelector("#app-page-dash");
    const task_page = document.querySelector("#app-page-task");

    main_dash.style.display = "grid";
    task_page.style.display = "none";
}

function post_comment() {
    const comment = document.querySelector("#selected-submission-comment-input");

    if (selected_submission && comment.value) {
        selected_submission.postComment(comment.value).then(comment => { // Post comment and update submission view.
            _cache.comments[comment.id] = comment;

            selected_assignment.getSubmissions([selected_submission.id]).then(submissions => {
                if (submissions[0]) {
                    _cache.submissions[submissions[0].id] = submissions[0];

                    select_submission(submissions[0]);
                }
            }).catch(console.log);
        }).catch(console.log);
        
        comment.value = "";
    }
}

function select_question(_question) {
    const question = {
        id: "",
        description: "",
        options: [],

        ..._question
    }

    const elem_structure = {
        id: document.querySelector("#selected-question-id"),
        question: document.querySelector("#selected-question-question"),
        options: document.querySelector("#selected-question-options")
    }

    elem_structure.id.innerHTML = "ID: " + question.id;
    elem_structure.question.innerHTML = "Question: " + question.description;
    elem_structure.options.innerHTML = question.options;
}

function select_submission(_submission) {
    selected_submission = _submission;

    var submission = {
        student_avatar: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
        id: "",
        student_name: "",
        student_id: "",
        status: "",
        grade: "",
        overdue: "",

        ..._submission
    }

    const elem_structure = {
        avatar: document.querySelector("#selected-submission-avatar"),
        id: document.querySelector("#selected-submission-id"),
        student: document.querySelector("#selected-submission-student"),
        student_id: document.querySelector("#selected-submission-student-id"),
        status: document.querySelector("#selected-submission-status"),
        grade: document.querySelector("#selected-submission-grade"),
        overdue: document.querySelector("#selected-submission-overdue"),
        comments: document.querySelector("#selected-submission-comments"),
    }

    var post_comment = document.querySelector("#selected-submission-post-comment");

    var comments = document.querySelector("#selected-submissions-comments");

    var submission_comments = Object.values(_cache.comments).filter(comment => _submission.comment_ids.indexOf(comment.id) !== -1);

    comments.innerHTML = "";
    
    submission_comments.forEach(comment => {
        const container = document.createElement("div");

        if (comment.user_id === submission.student_id) {
            container.className = "submission-comment-out";
        } else {
            container.className = "submission-comment-in";
        }

        const user = document.createElement("b");
        user.innerHTML = comment.user_name + " @ " + new Date(comment.created_at).toLocaleString() + ": ";
        
        const text = document.createTextNode(comment.text);

        container.appendChild(user);
        container.appendChild(text);

        comments.appendChild(container);
        comments.appendChild(document.createElement("br"));
    });

    elem_structure.avatar.src = submission.student_avatar;

    elem_structure.id.innerHTML = "ID: " + submission.id;
    elem_structure.student.innerHTML = "Student: " + submission.student_name;
    elem_structure.student_id.innerHTML = "Student ID: " + submission.student_id;
    elem_structure.status.innerHTML = "Status: " + submission.status;
    elem_structure.grade.innerHTML = "Grade: " + submission.grade || "-";
    elem_structure.overdue.innerHTML = "Overdue: " + submission.overdue;
    elem_structure.comments.innerHTML = "Comments: " + submission.comment_ids.length;

    if (submission.student_id === client.student.id) {
        post_comment.style.display = "flex";
    } else {
        post_comment.style.display = "none";
    }
}

function select_teacher(teacher) {
    const elem_structure = {
        id: document.querySelector("#selected-teacher-id"),
        title: document.querySelector("#selected-teacher-title"),
        forename: document.querySelector("#selected-teacher-forename"),
        surname: document.querySelector("#selected-teacher-surname"),
        simsid: document.querySelector("#selected-teacher-sims-id"),
        createdat: document.querySelector("#selected-teacher-created-at"),
        avatar: document.querySelector("#selected-teacher-avatar"),
        setfilter: document.querySelector("#selected-teacher-set-filter")
    }

    elem_structure.id.innerHTML = "ID: " + teacher.id;
    elem_structure.title.innerHTML = "Title: " + teacher.title;
    elem_structure.forename.innerHTML = "Forename: " + (_cache.users[teacher.id] ? _cache.users[teacher.id].forename : teacher.forename);
    elem_structure.surname.innerHTML = "Surname: " + teacher.surname;
    elem_structure.simsid.innerHTML = "Sims ID: " + (_cache.users[teacher.id] ? _cache.users[teacher.id].sims_id : "");
    elem_structure.createdat.innerHTML = "Created at: " + (_cache.users[teacher.id] ? new Date(_cache.users[teacher.id].created_at).toDateString() : "");
    elem_structure.avatar.src = _cache.users[teacher.id] ? _cache.users[teacher.id].avatar : "https://via.placeholder.com/128";

    elem_structure.setfilter.onclick = function () {
        filter.teacher.value = teacher.title + " " + teacher.forename + ". " + teacher.surname;
        render_tasks();
    }
}

function select_class_group(class_group) {
    const elem_structure = {
        id: document.querySelector("#selected-class-group-id"),
        year: document.querySelector("#selected-class-group-year"),
        name: document.querySelector("#selected-class-group-name"),
        students: document.querySelector("#selected-class-group-students"),
        teachers: document.querySelector("#selected-class-group-teachers"),
        setfilter: document.querySelector("#selected-class-group-set-filter")
    }

    elem_structure.id.innerHTML = "ID: " + class_group.id;
    elem_structure.year.innerHTML = "Year: " + class_group.class_year;
    elem_structure.name.innerHTML = "Name: " + class_group.name;
    elem_structure.students.innerHTML = "Students: " + class_group.student_ids.length;
    elem_structure.teachers.innerHTML = "Teachers: " + class_group.teacher_ids.length;

    elem_structure.setfilter.onclick = function () {
        filter.class_group.value = class_group.name;
        render_tasks();
    }
}

function render_questions() {
    const filter = document.querySelector("#filter-questions-input");

    if (selected_task) {
        if (selected_assignment) {
            const questions = document.querySelector("#questions-table-body");

            const pool = Object.values(_cache.questions).filter(question => selected_assignment.question_ids.indexOf(question.id) !== -1);

            const filtered = filter.value ?
                pool.filter(question => question.description.toLowerCase().indexOf(filter.value.toLowerCase()) !== -1) :
                pool;

            questions.innerHTML = "";

            filtered.forEach((question, i) => {
                const row = document.createElement("tr");

                const selectcont = document.createElement("td");
                selectcont.className = "questions-table-select";

                const select = document.createElement("button");
                select.innerHTML = "🠒";
                select.className = "questions-table-select";
                select.onclick = function () {
                    select_question(question);
                }

                const num = document.createElement("td");
                num.innerHTML = (i + 1) + ".";
                num.className = "question-table-num";

                const question = document.createElement("td");
                question.innerHTML = question.description;
                question.className = "questions-table-question";

                selectcont.appendChild(select);

                row.appendChild(selectcont);
                row.appendChild(num);
                row.appendChild(description);

                questions.appendChild(row);
            });
        }
    }
}

function download_attachment(attachment) {
    dialog.showSaveDialog({ defaultPath: attachment.filename }).then(response => {
        if (!response.canceled) {
            var filewrite = fs.createWriteStream(response.filePath);

            const request = https.get(attachment.file_url, function(response) {
                response.pipe(filewrite);

                filewrite.on("finish", function() {
                    filewrite.close();
                });
            });
            
            request.on("error", function(err) {
                alert("There was an error downloading attachment " + attachment.filename + ".\n\nMessage: ", err.message);

                fs.unlinkSync(response.filePath); 
            });
        }
    });
}

// Edited version of this stack overflow answer.
// https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function render_attachments() {
    const filter = document.querySelector("#filter-attachments-input");

    if (selected_task) {
        if (selected_assignment) {
            const attachments = document.querySelector("#attachments-table-body");

            const pool = Object.values(_cache.attachments).filter(attachment => selected_assignment.attachment_ids.indexOf(attachment.id) !== -1);

            const filtered = filter.value ?
                pool.filter(attachment => attachment.filename.toLowerCase().indexOf(filter.value.toLowerCase()) !== -1) :
                pool;

            attachments.innerHTML = "";

            filtered.forEach(attachment => {
                const row = document.createElement("tr");

                const downloadcont = document.createElement("td");
                downloadcont.className = "attachment-table-download";

                const download = document.createElement("button");
                download.innerHTML = "⭳";
                download.className = "attachment-table-download";
                download.onclick = function () {
                    download_attachment(attachment);
                }

                const filename = document.createElement("td");
                filename.innerHTML = attachment.filename;
                filename.className = "attachment-table-filename";

                const filesize = document.createElement("td");
                filesize.innerHTML = formatBytes(attachment.file_size);
                filesize.className = "attachment-table-filesize";

                downloadcont.appendChild(download);

                row.appendChild(downloadcont);
                row.appendChild(filename);
                row.appendChild(filesize);

                attachments.appendChild(row);
            });
        }
    }
}

function render_submissions() {
    const filter = document.querySelector("#filter-submissions-input");

    if (selected_task) {
        if (selected_assignment) {
            const submissions = document.querySelector("#submissions-table-body");

            const pool = Object.values(_cache.submissions).filter(submission => selected_assignment.submission_ids.indexOf(submission.id) !== -1);

            const filtered = filter.value ? 
                pool.filter(submission => submission.student_name.toLowerCase().indexOf(filter.value.toLowerCase()) !== -1) : 
                pool;

            filtered.sort((a, b) => {
                return a.student_name.localeCompare(b.student_name);
            });

            submissions.innerHTML = "";

            filtered.forEach(submission => {
                const row = document.createElement("tr");

                if (submission.status === "not-submitted" && selected_assignment.due_on + 86400000 > Date.now()) {
                    row.className = "submission-table-status-" + submission.status + "-yet";
                } else {
                    row.className = "submission-table-status-" + submission.status;
                }

                const selectcont = document.createElement("td");
                selectcont.className = "submission-table-select";

                const select = document.createElement("button");
                select.innerHTML = "🠒";
                select.className = "submission-table-select";
                select.onclick = function () {
                    select_submission(submission);
                }

                const student = document.createElement("td");
                student.innerHTML = submission.student_name;
                student.className = "submission-table-student";

                const status = document.createElement("td");
                status.innerHTML = submission.status;
                status.className = "submission-table-status";

                const grade = document.createElement("td");
                grade.innerHTML = submission.grade || "-";
                grade.className = "submission-table-grade";

                selectcont.appendChild(select);

                row.appendChild(selectcont);
                row.appendChild(student);
                row.appendChild(status);
                row.appendChild(grade);

                submissions.appendChild(row);
            });
        }
    }
}

function render_tasks() {
    const tasks = document.querySelector("#tasks-table-body");

    const pool = filter.show_past.checked ? 
        Object.values(_cache.tasks) : 
        Object.values(_cache.tasks).filter(task => !task.completed || (task.due_on + 86400000 /* A day in ms */) > Date.now());

    const filtered_class_group = filter.class_group.value ?
        pool.filter(task => task.class_group_name.toLowerCase().indexOf(filter.class_group.value.toLowerCase()) !== -1) :
        pool;

    const filtered_subject = filter.subject.value ?
        filtered_class_group.filter(task => task.subject.toLowerCase().indexOf(filter.subject.value.toLowerCase()) !== -1) :
        filtered_class_group;

    const filtered_teacher = filter.teacher.value ?
        filtered_subject.filter(task => task.teacher_name.toLowerCase().indexOf(filter.teacher.value.toLowerCase()) !== -1) :
        filtered_subject;

    function next(filtered) {
        filtered.sort((a, b) => {
            return a.due_on - b.due_on;
        });

        tasks.innerHTML = "";

        filtered.forEach((task, i, arr) => {
            const row = document.createElement("tr");
            row.className = task.className = "task-table-row-" + task.class_task_type.toLowerCase();

            if ((task.due_on + 86400000) < Date.now() && (!arr[i + 1] || (arr[i + 1].due_on + 86400000) > Date.now())) {
                row.className += " task-table-row-past-separator";
            }

            const selectcont = document.createElement("td");
            selectcont.className = "tasks-table-select";
    
            const select = document.createElement("button");
            select.innerHTML = "🠒";
            select.className = "task-table-select";
            select.onclick = function () {
                select_task(task);
            };
    
            const completedcont= document.createElement("td");
            completedcont.className = "tasks-table-completed";

            const completed = document.createElement("input");
            completed.type = "checkbox";
            completed.checked = task.completed;
            completed.onchange = function () {
                task.setCompleted(completed.checked).then(task => {
                    render_tasks();
                });
            }

            const due = document.createElement("td");
            due.innerHTML = new Date(task.due_on).toLocaleDateString();
            due.className = "tasks-table-due";

            const classgroup = document.createElement("td");
            classgroup.innerHTML = task.class_group_name;
            classgroup.className = "tasks-table-class-group";

            const subject = document.createElement("td");
            subject.innerHTML = task.subject;
            subject.className = "tasks-table-subject";
            
            const teacher = document.createElement("td");
            teacher.innerHTML = task.teacher_name;
            teacher.className = "tasks-table-teacher";
            
            const title = document.createElement("td");
            title.innerHTML = task.class_task_title;
            title.className = "tasks-table-title";

            selectcont.appendChild(select);
            completedcont.appendChild(completed);
            
            row.appendChild(selectcont);
            row.appendChild(completedcont);
            row.appendChild(due);
            row.appendChild(classgroup);
            row.appendChild(subject);
            row.appendChild(teacher);
            row.appendChild(title);
    
            tasks.appendChild(row);
        });
    }

    if (filter.title) {
        if (filter.regex.checked) {
            if (filter.description.checked) {
                const filtered_title = filtered_teacher.filter(task => {
                    const regexp = new RegExp(filter.title.value, "g");

                    return regexp.test(task.class_task_title) || regexp.test(task.description || "");
                });
                
                next(filtered_title);
            } else {
                const filtered_title = filtered_teacher.filter(task => {
                    const regexp = new RegExp(filter.title.value, "g");

                    return regexp.test(task.class_task_title);
                });

                next(filtered_title);
            }
        } else {
            if (filter.description.checked) {
                const filtered_title = filtered_teacher.filter(task => {
                    return task.class_task_title.toLowerCase().indexOf(filter.title.value.toLowerCase()) !== -1 || (task.description || "").toLowerCase().indexOf(filter.title.value.toLowerCase()) !== -1;
                });
                
                next(filtered_title);
            } else {
                const filtered_title = filtered_teacher.filter(task => {
                    return task.class_task_title.toLowerCase().indexOf(filter.title.value.toLowerCase()) !== -1;
                });
                
                next(filtered_title);
            }
        }
    } else {
        next(filtered_teacher);
    }
}

function render_teachers() {
    const filter = document.querySelector("#filter-teachers-input");
    const showall = document.querySelector("#filter-teachers-show-all");

    const teachers = document.querySelector("#teachers-table-body");

    const pool = showall.checked ? Object.values(_cache.teachers) : my_teachers();
    const filtered = filter.value ? pool.filter(teacher => teacher.surname.toLowerCase().indexOf(filter.value.toLowerCase()) !== -1) : pool;

    filtered.sort((a, b) => {
        return a.surname.localeCompare(b.surname);
    });

    teachers.innerHTML = "";

    filtered.forEach(teacher => {
        const row = document.createElement("tr");

        const selectcont = document.createElement("td");
        selectcont.className = "class-group-table-select";

        const select = document.createElement("button");
        select.innerHTML = "🠒";
        select.className = "teacher-table-select";
        select.onclick = function () {
            select_teacher(teacher);
        };

        const title = document.createElement("td");
        title.innerHTML = teacher.title;
        title.className = "teachers-table-title";
        
        const forename = document.createElement("td");
        forename.innerHTML = _cache.users[teacher.id] ? _cache.users[teacher.id].forename : teacher.forename;
        forename.className = "teachers-table-forename";
        
        const surname = document.createElement("td");
        surname.innerHTML = teacher.surname;
        surname.className = "teachers-table-surname";

        selectcont.appendChild(select);

        row.appendChild(selectcont);
        row.appendChild(title);
        row.appendChild(forename);
        row.appendChild(surname);

        teachers.appendChild(row);
    });
}

function render_class_groups() {
    const filter = document.querySelector("#filter-class-groups-input");
    const showall = document.querySelector("#filter-class-groups-show-all");

    const class_groups = document.querySelector("#class-groups-table-body");

    const pool = showall.checked ? Object.values(_cache.class_groups) : my_class_groups();
    const filtered = filter.value ? pool.filter(class_group => class_group.name.toLowerCase().indexOf(filter.value.toLowerCase()) !== -1) : pool;

    filtered.sort((a, b) => {
        var ayr = (a.class_year.match(/\d+/) || []);
        var byr = (b.class_year.match(/\d+/) || []);
        return parseInt(ayr[0]) - parseInt(byr[0]);
    });

    class_groups.innerHTML = "";

    filtered.forEach(class_group => {
        const row = document.createElement("tr");

        const selectcont = document.createElement("td");
        selectcont.className = "class-group-table-select";

        const select = document.createElement("button");
        select.innerHTML = "🠒";
        select.onclick = function () {
            select_class_group(class_group);
        };
        
        const year = document.createElement("td");
        year.innerHTML = class_group.class_year;
        year.className = "class-groups-table-year";

        const name = document.createElement("td");
        name.innerHTML = class_group.name;
        name.className = "class-groups-table-name";
        
        const students = document.createElement("td");
        students.innerHTML = class_group.student_ids.length;
        students.className = "class-groups-table-students";

        selectcont.appendChild(select);

        row.appendChild(selectcont);
        row.appendChild(year);
        row.appendChild(name);
        row.appendChild(students);

        class_groups.appendChild(row);
    });
}

client.login(cred.school, cred.username, cred.password).then(() => {
    client.school.getEmployees().then(employees => {
        client.school.getClassGroups().then(class_groups => {
            client.getTasks().then(tasks => {
                const teachers = employees.filter(employee => employee.employee_type === "teacher");

                teachers.forEach(teacher => {
                    _cache.teachers[teacher.id] = teacher;
                });

                class_groups.forEach(class_group => {
                    _cache.class_groups[class_group.id] = class_group;
                });

                tasks.forEach(task => {
                    _cache.tasks[task.id] = task;
                });

                client.getUsers(my_teachers().map(employee => employee.id)).then(users => {
                    users.forEach(user => {
                        _cache.users[user.id] = user;
                    });
                    
                    render_tasks();
                    render_teachers();
                    render_class_groups();
                });
            });
        });
    });
});