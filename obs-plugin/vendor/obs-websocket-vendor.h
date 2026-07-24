/*
 * Minimal vendor-only subset of obs-websocket's public plugin API.
 *
 * Copyright (C) 2016-2021 Stephane Lepin <stephane.lepin@gmail.com>
 * Copyright (C) 2020-2022 Kyle Manning <tt2468@gmail.com>
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Upstream: https://github.com/obsproject/obs-websocket/blob/master/lib/obs-websocket-api.h
 */

#ifndef OBSEE_OBS_WEBSOCKET_VENDOR_H
#define OBSEE_OBS_WEBSOCKET_VENDOR_H

#include <obs.h>
#include <string.h>

typedef void *obs_websocket_vendor;
typedef void (*obs_websocket_request_callback_function)(obs_data_t *, obs_data_t *, void *);

struct obs_websocket_request_callback {
  obs_websocket_request_callback_function callback;
  void *priv_data;
};

static proc_handler_t *obsee_websocket_proc_handler;

static inline proc_handler_t *obsee_websocket_get_proc_handler(void)
{
  proc_handler_t *global_proc_handler = obs_get_proc_handler();
  if (!global_proc_handler)
    return NULL;

  calldata_t calldata = {0};
  if (!proc_handler_call(global_proc_handler, "obs_websocket_api_get_ph", &calldata)) {
    calldata_free(&calldata);
    return NULL;
  }

  proc_handler_t *result = calldata_ptr(&calldata, "ph");
  calldata_free(&calldata);
  return result;
}

static inline bool obsee_websocket_ensure_proc_handler(void)
{
  if (!obsee_websocket_proc_handler)
    obsee_websocket_proc_handler = obsee_websocket_get_proc_handler();
  return obsee_websocket_proc_handler != NULL;
}

static inline obs_websocket_vendor obs_websocket_register_vendor(const char *vendor_name)
{
  if (!obsee_websocket_ensure_proc_handler())
    return NULL;

  calldata_t calldata = {0};
  calldata_set_string(&calldata, "name", vendor_name);
  proc_handler_call(obsee_websocket_proc_handler, "vendor_register", &calldata);
  obs_websocket_vendor result = calldata_ptr(&calldata, "vendor");
  calldata_free(&calldata);
  return result;
}

static inline bool obs_websocket_vendor_register_request(
  obs_websocket_vendor vendor,
  const char *request_type,
  obs_websocket_request_callback_function request_callback,
  void *private_data)
{
  if (!obsee_websocket_ensure_proc_handler() || !vendor || !request_type ||
      !strlen(request_type) || !request_callback)
    return false;

  struct obs_websocket_request_callback callback = {
    .callback = request_callback,
    .priv_data = private_data,
  };
  calldata_t calldata = {0};
  calldata_set_string(&calldata, "type", request_type);
  calldata_set_ptr(&calldata, "callback", &callback);
  calldata_set_ptr(&calldata, "vendor", vendor);
  proc_handler_call(obsee_websocket_proc_handler, "vendor_request_register", &calldata);
  bool result = calldata_bool(&calldata, "success");
  calldata_free(&calldata);
  return result;
}

static inline bool obs_websocket_vendor_unregister_request(
  obs_websocket_vendor vendor,
  const char *request_type)
{
  if (!obsee_websocket_ensure_proc_handler() || !vendor || !request_type)
    return false;

  calldata_t calldata = {0};
  calldata_set_string(&calldata, "type", request_type);
  calldata_set_ptr(&calldata, "vendor", vendor);
  proc_handler_call(obsee_websocket_proc_handler, "vendor_request_unregister", &calldata);
  bool result = calldata_bool(&calldata, "success");
  calldata_free(&calldata);
  return result;
}

#endif

