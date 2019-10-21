import { notifyObservers } from "../src/actions";

const WAIT = 1000;

describe('notifyObservers', () => {
    const thunk = notifyObservers({
        id: 'id',
        props: {},
        undefined
    });

    it('executes if app is ready', async () => {
        let done = false;
        thunk(
            () => { },
            () => ({
                graphs: {
                    InputGraph: {
                        hasNode: () => false,
                        dependenciesOf: () => [],
                        dependantsOf: () => [],
                        overallOrder: () => 0
                    }
                },
                isAppReady: true,
                requestQueue: []
            })
        ).then(() => { done = true; });

        await new Promise(r => setTimeout(r, 0));
        expect(done).toEqual(true);
    });

    it('waits on app to be ready', async () => {
        let resolve;
        const isAppReady = new Promise(r => {
            resolve = r;
        });

        let done = false;
        thunk(
            () => { },
            () => ({
                graphs: {
                    InputGraph: {
                        hasNode: () => false,
                        dependenciesOf: () => [],
                        dependantsOf: () => [],
                        overallOrder: () => 0
                    }
                },
                isAppReady,
                requestQueue: []
            })
        ).then(() => { done = true; });

        await new Promise(r => setTimeout(r, WAIT));
        expect(done).toEqual(false);

        resolve();

        await new Promise(r => setTimeout(r, WAIT));
        expect(done).toEqual(true);
    });

});