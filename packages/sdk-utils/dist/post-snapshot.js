import percy from './percy-info.js';
import request from './request.js'; // Post snapshot data to the snapshot endpoint. If the snapshot endpoint responds with a closed
// error message, signal that Percy has been disabled.

export async function postSnapshot(options, params) {
  let query = params ? `?${new URLSearchParams(params)}` : '';
  await request.post(`/percy/snapshot${query}`, options).catch(err => {
    var _err$response, _err$response$body, _err$response$body$bu;

    if ((_err$response = err.response) !== null && _err$response !== void 0 && (_err$response$body = _err$response.body) !== null && _err$response$body !== void 0 && (_err$response$body$bu = _err$response$body.build) !== null && _err$response$body$bu !== void 0 && _err$response$body$bu.error) {
      percy.enabled = false;
    } else {
      throw err;
    }
  });
}
export default postSnapshot;