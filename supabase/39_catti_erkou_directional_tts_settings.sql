-- =====================================================================
-- 39_catti_erkou_directional_tts_settings.sql
-- Direction-specific CATTI erkou TTS settings.
-- =====================================================================

alter table public.catti_mock_exams
  add column if not exists ec_voice_profile text default 'formal_diplomat_male',
  add column if not exists ec_accent_profile text default 'neutral',
  add column if not exists ec_speed_profile text default 'standard_exam',
  add column if not exists ec_speech_rate_value numeric default 1.0,
  add column if not exists ce_voice_profile text default 'chinese_diplomat_male',
  add column if not exists ce_accent_profile text default 'mandarin_standard',
  add column if not exists ce_speed_profile text default 'standard_exam',
  add column if not exists ce_speech_rate_value numeric default 1.0;
