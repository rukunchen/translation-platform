-- =====================================================================
-- 19_merge_document_chat_to_task_chat.sql
-- Merge earlier document-scoped chat messages back into the project/task
-- chat so project page and document pages show the same conversation.
-- =====================================================================

update public.chat_messages
set document_id = null
where document_id is not null;
