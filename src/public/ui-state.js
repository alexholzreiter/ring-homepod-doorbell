export function shouldApplyServerForm({ force = false, dirty = false } = {}) {
  return force || !dirty;
}

export function chooseVisibleOutputs(outputs, lastKnownOutputs) {
  return outputs.length ? outputs : lastKnownOutputs;
}
