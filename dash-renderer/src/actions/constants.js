const actionList = {
    ON_PROP_CHANGE: 'ON_PROP_CHANGE',
    SET_REQUEST_QUEUE: 'SET_REQUEST_QUEUE',
    COMPUTE_GRAPHS: 'COMPUTE_GRAPHS',
    COMPUTE_PATHS: 'COMPUTE_PATHS',
    SET_LAYOUT: 'SET_LAYOUT',
    SET_APP_LIFECYCLE: 'SET_APP_LIFECYCLE',
    READ_CONFIG: 'READ_CONFIG',
    ON_ERROR: 'ON_ERROR',
    RESOLVE_ERROR: 'RESOLVE_ERROR',
    SET_HOOKS: 'SET_HOOKS',
};

export const getAction = action => {
    if (actionList[action]) {
        return actionList[action];
    }
    throw new Error(`${action} is not defined.`);
};
