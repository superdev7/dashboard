import {
    all,
    concat,
    difference,
    filter,
    flatten,
    groupBy,
    includes,
    intersection,
    isEmpty,
    isNil,
    map,
    values
} from 'ramda';

import { IStoreState } from '../store';

import {
    aggregateCallbacks,
    removeRequestedCallbacks,
    removePrioritizedCallbacks,
    removeExecutingCallbacks,
    removeWatchedCallbacks,
    addRequestedCallbacks,
    addPrioritizedCallbacks,
    addExecutingCallbacks,
    addWatchedCallbacks,
    removeBlockedCallbacks,
    addBlockedCallbacks
} from '../actions/callbacks';

import { isMultiValued } from '../actions/dependencies';

import {
    combineIdAndProp,
    getReadyCallbacks,
    getUniqueIdentifier,
    pruneCallbacks
} from '../actions/dependencies_ts';

import {
    ICallback,
    IExecutingCallback,
    IStoredCallback,
    IBlockedCallback
} from '../types/callbacks';

import { getPendingCallbacks } from '../utils/callbacks';
import { IStoreObserverDefinition } from '../StoreObserver';

const observer: IStoreObserverDefinition<IStoreState> = {
    observer: ({
        dispatch,
        getState
    }) => {
        const { callbacks, callbacks: { prioritized, blocked, executing, watched, stored }, paths } = getState();
        let { callbacks: { requested } } = getState();

        const pendingCallbacks = getPendingCallbacks(callbacks);

        /*
            0. Prune circular callbacks that have completed the loop
            - cb.callback included in cb.predecessors
        */
        const rCirculars = filter(
            cb => includes(cb.callback, cb.predecessors ?? []),
            requested
        );

        /*
            TODO?
            Clean up the `requested` list - during the dispatch phase,
            circulars will be removed for real
        */
        requested = difference(requested, rCirculars);

        /*
            1. Remove duplicated `requested` callbacks - give precedence to newer callbacks over older ones
        */

        /*
            Extract all but the first callback from each IOS-key group
            these callbacks are duplicates.
        */
        const rDuplicates = flatten(map(
            group => group.slice(0, -1),
            values(
                groupBy<ICallback>(
                    getUniqueIdentifier,
                    requested
                )
            )
        ));

        /*
            TODO?
            Clean up the `requested` list - during the dispatch phase,
            duplicates will be removed for real
        */
        requested = difference(requested, rDuplicates);

        /*
            2. Remove duplicated `prioritized`, `executing` and `watching` callbacks
        */

        /*
            Extract all but the first callback from each IOS-key group
            these callbacks are `prioritized` and duplicates.
        */
        const pDuplicates = flatten(map(
            group => group.slice(0, -1),
            values(
                groupBy<ICallback>(
                    getUniqueIdentifier,
                    concat(prioritized, requested)
                )
            )
        ));

        const bDuplicates = flatten(map(
            group => group.slice(0, -1),
            values(
                groupBy<ICallback>(
                    getUniqueIdentifier,
                    concat(blocked, requested)
                )
            )
        )) as IBlockedCallback[];

        const eDuplicates = flatten(map(
            group => group.slice(0, -1),
            values(
                groupBy<ICallback>(
                    getUniqueIdentifier,
                    concat(executing, requested)
                )
            )
        )) as IExecutingCallback[];

        const wDuplicates = flatten(map(
            group => group.slice(0, -1),
            values(
                groupBy<ICallback>(
                    getUniqueIdentifier,
                    concat(watched, requested)
                )
            )
        )) as IExecutingCallback[];

        /*
            3. Modify or remove callbacks that are outputting to non-existing layout `id`.
        */

        const { added: rAdded, removed: rRemoved } = pruneCallbacks(requested, paths);
        const { added: pAdded, removed: pRemoved } = pruneCallbacks(prioritized, paths);
        const { added: bAdded, removed: bRemoved } = pruneCallbacks(blocked, paths);
        const { added: eAdded, removed: eRemoved } = pruneCallbacks(executing, paths);
        const { added: wAdded, removed: wRemoved } = pruneCallbacks(watched, paths);

        /*
            TODO?
            Clean up the `requested` list - during the dispatch phase,
            it will be updated for real
        */
        requested = concat(
            difference(
                requested,
                rRemoved
            ),
            rAdded
        );

        /*
            4. Find `requested` callbacks that do not depend on a outstanding output (as either input or state)
        */
        let readyCallbacks = getReadyCallbacks(paths, requested, pendingCallbacks);

        let oldBlocked: ICallback[] = [];
        let newBlocked: ICallback[] = [];

        /**
         * If there is :
         * - no ready callbacks
         * - at least one requested callback
         * - no additional pending callbacks
         *
         * can assume:
         * - the requested callbacks are part of a circular dependency loop
         *
         * then recursively:
         * - assume the first callback in the list is ready (the entry point for the loop)
         * - check what callbacks are blocked / ready with the assumption
         * - update the missing predecessors based on assumptions
         * - continue until there are no remaining candidates
         *
         */
        if (
            !readyCallbacks.length &&
            requested.length &&
            requested.length === pendingCallbacks.length
        ) {
            let candidates = requested.slice(0);

            while (candidates.length) {
                // Assume 1st callback is ready and
                // update candidates / readyCallbacks accordingly
                const readyCallback = candidates[0];

                readyCallbacks.push(readyCallback);
                candidates = candidates.slice(1);

                // Remaining candidates are not blocked by current assumptions
                candidates = getReadyCallbacks(paths, candidates, readyCallbacks);

                // Blocked requests need to make sure they have the callback as a predecessor
                const blockedByAssumptions = difference(candidates, candidates);

                const modified = filter(
                    cb => !cb.predecessors || !includes(readyCallback.callback, cb.predecessors),
                    blockedByAssumptions
                );

                oldBlocked = concat(oldBlocked, modified);
                newBlocked = concat(newBlocked, modified.map(cb => ({
                    ...cb,
                    predecessors: concat(cb.predecessors ?? [], [readyCallback.callback])
                })));
            }
        }

        /*
            TODO?
            Clean up the `requested` list - during the dispatch phase,
            it will be updated for real
        */
        requested = concat(
            difference(
                requested,
                oldBlocked
            ),
            newBlocked
        );

        /*
            5. Prune callbacks that became irrelevant in their `executionGroup`
        */

        // Group by executionGroup, drop non-executionGroup callbacks
        // those were not triggered by layout changes and don't have "strong" interdependency for
        // callback chain completion
        const pendingGroups = groupBy<IStoredCallback>(
            cb => cb.executionGroup as any,
            filter(cb => !isNil(cb.executionGroup), stored)
        );

        const dropped: ICallback[] = filter(cb => {
            // If there is no `stored` callback for the group, no outputs were dropped -> `cb` is kept
            if (!cb.executionGroup || !pendingGroups[cb.executionGroup] || !pendingGroups[cb.executionGroup].length) {
                return false;
            }

            // Get all inputs for `cb`
            const inputs = map(combineIdAndProp, flatten(cb.getInputs(paths)));

            // Get all the potentially updated props for the group so far
            const allProps = flatten(map(
                gcb => gcb.executionMeta.allProps,
                pendingGroups[cb.executionGroup]
            ));

            // Get all the updated props for the group so far
            const updated = flatten(map(
                gcb => gcb.executionMeta.updatedProps,
                pendingGroups[cb.executionGroup]
            ));

            // If there's no overlap between the updated props and the inputs,
            // + there's no props that aren't covered by the potentially updated props,
            // and not all inputs are multi valued
            // -> drop `cb`
            const res =
                isEmpty(intersection(
                    inputs,
                    updated
                )) &&
                isEmpty(difference(
                    inputs,
                    allProps
                ))
                && !all(
                    isMultiValued,
                    cb.callback.inputs
                );

            return res;
        },
            readyCallbacks
        );

        /*
            TODO?
            Clean up the `requested` list - during the dispatch phase,
            it will be updated for real
        */
        requested = difference(
            requested,
            dropped
        );

        readyCallbacks = difference(
            readyCallbacks,
            dropped
        );

        dispatch(aggregateCallbacks([
            // Clean up duplicated callbacks
            rDuplicates.length ? removeRequestedCallbacks(rDuplicates) : null,
            pDuplicates.length ? removePrioritizedCallbacks(pDuplicates) : null,
            bDuplicates.length ? removeBlockedCallbacks(bDuplicates) : null,
            eDuplicates.length ? removeExecutingCallbacks(eDuplicates) : null,
            wDuplicates.length ? removeWatchedCallbacks(wDuplicates) : null,
            // Prune callbacks
            rRemoved.length ? removeRequestedCallbacks(rRemoved) : null,
            rAdded.length ? addRequestedCallbacks(rAdded) : null,
            pRemoved.length ? removePrioritizedCallbacks(pRemoved) : null,
            pAdded.length ? addPrioritizedCallbacks(pAdded) : null,
            bRemoved.length ? removeBlockedCallbacks(bRemoved) : null,
            bAdded.length ? addBlockedCallbacks(bAdded) : null,
            eRemoved.length ? removeExecutingCallbacks(eRemoved) : null,
            eAdded.length ? addExecutingCallbacks(eAdded) : null,
            wRemoved.length ? removeWatchedCallbacks(wRemoved) : null,
            wAdded.length ? addWatchedCallbacks(wAdded) : null,
            // Prune circular callbacks
            rCirculars.length ? removeRequestedCallbacks(rCirculars) : null,
            // Prune circular assumptions
            oldBlocked.length ? removeRequestedCallbacks(oldBlocked) : null,
            newBlocked.length ? addRequestedCallbacks(newBlocked) : null,
            // Drop non-triggered initial callbacks
            dropped.length ? removeRequestedCallbacks(dropped) : null,
            // Promote callbacks
            readyCallbacks.length ? removeRequestedCallbacks(readyCallbacks) : null,
            readyCallbacks.length ? addPrioritizedCallbacks(readyCallbacks) : null
        ]));
    },
    inputs: ['callbacks.requested', 'callbacks.completed']
};

export default observer;
