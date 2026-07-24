/*
 * Obsee Advanced Output Control
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

#include <obs-module.h>
#include <obs-frontend-api.h>
#include <util/config-file.h>
#include <util/platform.h>

#include <stdio.h>
#include <string.h>

#include "obs-websocket-vendor.h"

#define PLUGIN_NAME "obsee-advanced-control"
#define PLUGIN_VERSION "0.1.0"
#define VENDOR_NAME "obsee"
#define STREAM_ENCODER_FILE "streamEncoder.json"
#define RECORD_ENCODER_FILE "recordEncoder.json"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")

static obs_websocket_vendor vendor;

MODULE_EXPORT const char *obs_module_description(void)
{
  return "Reads and safely applies OBS Advanced Output encoder settings for Obsee.";
}

static char *profile_file_path(const char *file_name)
{
  char *profile_path = obs_frontend_get_current_profile_path();
  if (!profile_path)
    return NULL;

  const size_t profile_length = strlen(profile_path);
  const size_t file_length = strlen(file_name);
  const bool needs_separator = profile_length > 0 && profile_path[profile_length - 1] != '/';
  char *result = bmalloc(profile_length + file_length + (needs_separator ? 2 : 1));
  snprintf(result, profile_length + file_length + (needs_separator ? 2 : 1),
           "%s%s%s", profile_path, needs_separator ? "/" : "", file_name);
  bfree(profile_path);
  return result;
}

static obs_data_t *load_persisted_settings(const char *file_name)
{
  char *path = profile_file_path(file_name);
  if (!path)
    return obs_data_create();

  obs_data_t *settings = obs_data_create_from_json_file_safe(path, "bak");
  bfree(path);
  return settings ? settings : obs_data_create();
}

static obs_data_t *load_effective_settings(const char *encoder_id, const char *file_name)
{
  obs_data_t *settings = encoder_id && *encoder_id
    ? obs_encoder_defaults(encoder_id)
    : NULL;
  if (!settings)
    settings = obs_data_create();

  obs_data_t *persisted = load_persisted_settings(file_name);
  obs_data_apply(settings, persisted);
  obs_data_release(persisted);
  return settings;
}

static obs_encoder_t *get_output_encoder(bool recording, obs_output_t **output)
{
  *output = recording
    ? obs_frontend_get_recording_output()
    : obs_frontend_get_streaming_output();
  return *output ? obs_output_get_video_encoder(*output) : NULL;
}

static bool encoder_is_active(bool recording)
{
  obs_output_t *output = NULL;
  obs_encoder_t *encoder = get_output_encoder(recording, &output);
  const bool active = encoder && obs_encoder_active(encoder);
  if (output)
    obs_output_release(output);
  return active;
}

static void set_encoder_response(
  obs_data_t *response,
  const char *encoder_id,
  const char *file_name,
  bool recording)
{
  obs_data_t *settings = load_effective_settings(encoder_id, file_name);
  obs_data_set_bool(response, "available", encoder_id && *encoder_id);
  obs_data_set_string(response, "encoderId", encoder_id ? encoder_id : "");
  obs_data_set_bool(response, "active", encoder_is_active(recording));
  obs_data_set_string(response, "rate_control", obs_data_get_string(settings, "rate_control"));
  obs_data_set_int(response, "bitrate", obs_data_get_int(settings, "bitrate"));
  obs_data_set_int(response, "quality", obs_data_get_int(settings, "quality"));
  obs_data_set_bool(response, "limit_bitrate", obs_data_get_bool(settings, "limit_bitrate"));
  obs_data_set_int(response, "max_bitrate", obs_data_get_int(settings, "max_bitrate"));
  obs_data_set_double(response, "max_bitrate_window",
                      obs_data_get_double(settings, "max_bitrate_window"));
  obs_data_set_int(response, "keyint_sec", obs_data_get_int(settings, "keyint_sec"));
  obs_data_set_string(response, "profile", obs_data_get_string(settings, "profile"));
  obs_data_set_bool(response, "bframes", obs_data_get_bool(settings, "bframes"));
  obs_data_set_int(response, "spatial_aq_mode",
                   obs_data_get_int(settings, "spatial_aq_mode"));
  obs_data_release(settings);
}

static bool string_is_one_of(const char *value, const char *const *allowed, size_t count)
{
  for (size_t index = 0; index < count; index++) {
    if (strcmp(value, allowed[index]) == 0)
      return true;
  }
  return false;
}

static bool apply_int(
  obs_data_t *target,
  obs_data_t *request,
  const char *key,
  long long minimum,
  long long maximum,
  char *error,
  size_t error_size)
{
  if (!obs_data_has_user_value(request, key))
    return true;

  const long long value = obs_data_get_int(request, key);
  if (value < minimum || value > maximum) {
    snprintf(error, error_size, "%s must be between %lld and %lld", key, minimum, maximum);
    return false;
  }

  obs_data_set_int(target, key, value);
  return true;
}

static bool apply_double(
  obs_data_t *target,
  obs_data_t *request,
  const char *key,
  double minimum,
  double maximum,
  char *error,
  size_t error_size)
{
  if (!obs_data_has_user_value(request, key))
    return true;

  const double value = obs_data_get_double(request, key);
  if (value < minimum || value > maximum) {
    snprintf(error, error_size, "%s is outside the allowed range", key);
    return false;
  }

  obs_data_set_double(target, key, value);
  return true;
}

static bool apply_string(
  obs_data_t *target,
  obs_data_t *request,
  const char *key,
  const char *const *allowed,
  size_t allowed_count,
  char *error,
  size_t error_size)
{
  if (!obs_data_has_user_value(request, key))
    return true;

  const char *value = obs_data_get_string(request, key);
  if (!string_is_one_of(value, allowed, allowed_count)) {
    snprintf(error, error_size, "%s has an unsupported value", key);
    return false;
  }

  obs_data_set_string(target, key, value);
  return true;
}

static bool apply_encoder_patch(
  obs_data_t *target,
  obs_data_t *request,
  char *error,
  size_t error_size)
{
  static const char *rate_controls[] = {"CBR", "ABR", "CRF"};
  static const char *profiles[] = {
    "baseline", "main", "high", "main10", "main42210",
  };

  if (!apply_string(target, request, "rate_control", rate_controls, 3, error, error_size) ||
      !apply_int(target, request, "bitrate", 50, 10000000, error, error_size) ||
      !apply_int(target, request, "quality", 0, 100, error, error_size) ||
      !apply_int(target, request, "max_bitrate", 50, 10000000, error, error_size) ||
      !apply_double(target, request, "max_bitrate_window", 0.1, 10.0, error, error_size) ||
      !apply_int(target, request, "keyint_sec", 0, 20, error, error_size) ||
      !apply_string(target, request, "profile", profiles, 5, error, error_size) ||
      !apply_int(target, request, "spatial_aq_mode", 1, 3, error, error_size))
    return false;

  if (obs_data_has_user_value(request, "limit_bitrate"))
    obs_data_set_bool(target, "limit_bitrate",
                      obs_data_get_bool(request, "limit_bitrate"));
  if (obs_data_has_user_value(request, "bframes"))
    obs_data_set_bool(target, "bframes", obs_data_get_bool(request, "bframes"));
  return true;
}

static bool persist_and_update(
  const char *encoder_id,
  const char *file_name,
  bool recording,
  obs_data_t *request,
  char *error,
  size_t error_size)
{
  if (!encoder_id || !*encoder_id) {
    snprintf(error, error_size, "No advanced encoder is selected");
    return false;
  }

  obs_data_t *persisted = load_persisted_settings(file_name);
  if (!apply_encoder_patch(persisted, request, error, error_size)) {
    obs_data_release(persisted);
    return false;
  }

  char *path = profile_file_path(file_name);
  if (!path || !obs_data_save_json_safe(persisted, path, "tmp", "obsee-backup")) {
    snprintf(error, error_size, "Could not save %s", file_name);
    bfree(path);
    obs_data_release(persisted);
    return false;
  }

  obs_data_t *effective = obs_encoder_defaults(encoder_id);
  if (!effective)
    effective = obs_data_create();
  obs_data_apply(effective, persisted);

  obs_output_t *output = NULL;
  obs_encoder_t *encoder = get_output_encoder(recording, &output);
  if (encoder && strcmp(obs_encoder_get_id(encoder), encoder_id) == 0)
    obs_encoder_update(encoder, effective);

  if (output)
    obs_output_release(output);
  obs_data_release(effective);
  obs_data_release(persisted);
  bfree(path);
  return true;
}

static void get_advanced_output_config(
  obs_data_t *request_data,
  obs_data_t *response_data,
  void *private_data)
{
  UNUSED_PARAMETER(request_data);
  UNUSED_PARAMETER(private_data);

  config_t *config = obs_frontend_get_profile_config();
  const char *mode = config ? config_get_string(config, "Output", "Mode") : NULL;
  const bool advanced = mode && strcmp(mode, "Advanced") == 0;

  obs_data_set_bool(response_data, "success", true);
  obs_data_set_bool(response_data, "available", advanced);
  obs_data_set_string(response_data, "pluginVersion", PLUGIN_VERSION);
  obs_data_set_string(response_data, "outputMode", mode ? mode : "");

  if (!advanced)
    return;

  const char *stream_encoder = config_get_string(config, "AdvOut", "Encoder");
  const char *record_encoder = config_get_string(config, "AdvOut", "RecEncoder");
  obs_data_t *stream = obs_data_create();
  obs_data_t *recording = obs_data_create();
  set_encoder_response(stream, stream_encoder, STREAM_ENCODER_FILE, false);
  set_encoder_response(recording, record_encoder, RECORD_ENCODER_FILE, true);
  obs_data_set_obj(response_data, "stream", stream);
  obs_data_set_obj(response_data, "recording", recording);
  obs_data_release(stream);
  obs_data_release(recording);
}

static void apply_advanced_output_config(
  obs_data_t *request_data,
  obs_data_t *response_data,
  void *private_data)
{
  UNUSED_PARAMETER(private_data);

  if (obs_frontend_streaming_active() || obs_frontend_recording_active()) {
    obs_data_set_bool(response_data, "success", false);
    obs_data_set_string(response_data, "error",
                        "Stop streaming and recording before changing encoder settings");
    return;
  }

  config_t *config = obs_frontend_get_profile_config();
  const char *mode = config ? config_get_string(config, "Output", "Mode") : NULL;
  if (!mode || strcmp(mode, "Advanced") != 0) {
    obs_data_set_bool(response_data, "success", false);
    obs_data_set_string(response_data, "error", "OBS Output Mode is not Advanced");
    return;
  }

  char error[256] = {0};
  obs_data_t *stream = obs_data_get_obj(request_data, "stream");
  obs_data_t *recording = obs_data_get_obj(request_data, "recording");
  const char *stream_encoder = config_get_string(config, "AdvOut", "Encoder");
  const char *record_encoder = config_get_string(config, "AdvOut", "RecEncoder");

  bool success = true;
  if (stream) {
    success = persist_and_update(stream_encoder, STREAM_ENCODER_FILE, false,
                                 stream, error, sizeof(error));
  }
  if (success && recording) {
    success = persist_and_update(record_encoder, RECORD_ENCODER_FILE, true,
                                 recording, error, sizeof(error));
  }

  if (stream)
    obs_data_release(stream);
  if (recording)
    obs_data_release(recording);

  obs_data_set_bool(response_data, "success", success);
  if (!success) {
    obs_data_set_string(response_data, "error", error);
    return;
  }

  obs_data_set_bool(response_data, "available", true);
  obs_data_set_string(response_data, "pluginVersion", PLUGIN_VERSION);
  obs_data_set_string(response_data, "outputMode", "Advanced");
  obs_data_t *stream_response = obs_data_create();
  obs_data_t *recording_response = obs_data_create();
  set_encoder_response(stream_response, stream_encoder, STREAM_ENCODER_FILE, false);
  set_encoder_response(recording_response, record_encoder, RECORD_ENCODER_FILE, true);
  obs_data_set_obj(response_data, "stream", stream_response);
  obs_data_set_obj(response_data, "recording", recording_response);
  obs_data_release(stream_response);
  obs_data_release(recording_response);
}

bool obs_module_load(void)
{
  blog(LOG_INFO, "[%s] loaded version %s", PLUGIN_NAME, PLUGIN_VERSION);
  return true;
}

void obs_module_post_load(void)
{
  vendor = obs_websocket_register_vendor(VENDOR_NAME);
  if (!vendor) {
    blog(LOG_ERROR, "[%s] obs-websocket vendor registration failed", PLUGIN_NAME);
    return;
  }

  const bool get_registered = obs_websocket_vendor_register_request(
    vendor, "GetAdvancedOutputConfig", get_advanced_output_config, NULL);
  const bool apply_registered = obs_websocket_vendor_register_request(
    vendor, "ApplyAdvancedOutputConfig", apply_advanced_output_config, NULL);

  if (!get_registered || !apply_registered)
    blog(LOG_ERROR, "[%s] one or more vendor requests could not be registered",
         PLUGIN_NAME);
}

void obs_module_unload(void)
{
  if (!vendor)
    return;
  obs_websocket_vendor_unregister_request(vendor, "GetAdvancedOutputConfig");
  obs_websocket_vendor_unregister_request(vendor, "ApplyAdvancedOutputConfig");
}
