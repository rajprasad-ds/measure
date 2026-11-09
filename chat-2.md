Claude
I should be able to use it on both device, because the per session timer, I will mostly use a phone for that, but for analyzing the data, I'll mostly use something sort of a laptop size screen.

That settles it: you need a cloud database so a session logged on your phone shows up on your laptop. The split is also clean: the phone is the capture tool (timers, question numbers, feedback), and the laptop is the analysis tool.

Question 6: Your phone will run the session, so what happens if the internet drops mid-session, or your connection is weak while you practice? Should the timers and logging keep working offline and sync later? Or is it fine to require a connection for the whole session?

Offline-first is more work to build, but it protects your data. A session lost to a bad connection is exactly the kind of thing that would make you stop using the app.

Yes, it should work. It should work offline. Yes, because when internet is on, you get all those notifications a lot. So if it works offline, it would be better. I mean, there will be less distractions for that.

Offline-first fits the goal well. Turning off the internet during practice removes a whole class of distractions, and the app doesn’t need it.

The design is:

During a session: everything (timers, question numbers, feedback) saves on your phone only.
After the session: the data syncs to the cloud database when you’re back online, and your laptop picks it up.
Question 7: At the end of a session, for questions marked “didn’t know the topic,” you pick which topic it was. The syllabus PDF only gives chapters, not the topics inside them. Where should the topic list come from?

Fixed list: built ahead of time per chapter, for example from your PYQ book’s table of contents. Picking is fast and the data stays clean.
Free typing: you type the topic yourself, and the app remembers past entries as suggestions. It’s flexible, but spelling differences can split the same topic into several entries.
Which fits how you work?

Don't worry, the PDF will have the chapter as well as the topics. I'll provide you the PDF when we are actually into building it. First, if you do not have any doubt, then we can close this grill me sessions and then work on implementations. And I think we can improve more when we are actually building it and using it.

Good, the PDF having topics settles the “didn’t know the topic” list. I have no blocking doubts, and building and using it will surface more than more questions would. Here’s what I’ll assume:

Phone app: an installable web app (PWA) that stores sessions locally while you’re offline and syncs afterwards. A cloud database (Supabase) holds the history, and a simple login protects it.
Learning sessions: these log only chapter, topic, and active time, with no per-question tracking.
Question numbers: I’ll add an optional “source” field (book name) that you set once per session. Question 179 means nothing later unless we know which book it came from.
Streaks and dashboard: left for later, as you said. Capture comes first.
Question 8: Do you want me to start building now with a placeholder chapter list and swap in the PDF later, or wait until you have the PDF ready?

I have the PDF ready, but I think first you should implement the practice session things. Okay, the thing that I will mostly use to create a session, select particular chapter and duration of that session, and be able to use that stopwatch per question efficiently, and also the feedback system. Yes, that's it.

Practice session
Artifact
·Only you
The practice session page is published: https://claude.ai/artifact/256LpQLhqYaMruoeDhBcmC

I haven’t tested it in a browser, so try one short session (use 30 minutes, or let it idle) before relying on it.

What it does

Setup: you pick subject, chapter, duration, and an optional book name.
Global timer: it counts down and has no stop or pause.
Stopwatch: Start unlocks only once a question number is entered. You start and stop it yourself. After a stop, the number moves to previous + 1 and stays editable.
Idle rules: a stopwatch idle for 10 minutes closes the session. A question running past 10 minutes shows a 10-second “Still solving?” alert, and no tap closes the session.
Feedback: after the session, each timed question gets Right, Wrong, or Didn’t know topic, and the last one asks which topic.
Summary: active vs total time, the time-used percentage, average time per question against 3:00, and accuracy.
Limits for now

Placeholder lists: the chapters are a generic list of JEE Maths chapters, and only two chapters have topic suggestions. Physics and Chemistry are empty. Your PDF replaces all of this next.
Storage: data is saved only in this browser on this device. There’s no cloud sync yet, and “Copy all session data” on the setup screen is your backup meanwhile.
Fonts: the page loads a web font, which only works online. Offline support and sync come with the database step.
Next step: send the PDF so I can load the real chapters and topics, or tell me what felt wrong after your first session.





