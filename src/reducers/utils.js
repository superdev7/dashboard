import R from 'ramda';

const extend = R.reduce(R.flip(R.append));

// crawl a layout object, apply a function on every object
export const crawlLayout = (object, func, path = []) => {
    func(object, path);

    /*
     * object may be a string, a number, or null
     * R.has will return false for both of those types
     */
    if (
        R.type(object) === 'Object' &&
        R.has('props', object) &&
        R.has('children', object.props)
    ) {
        const newPath = extend(path, ['props', 'children']);
        if (Array.isArray(object.props.children)) {
            object.props.children.forEach((child, i) => {
                crawlLayout(child, func, R.append(i, newPath));
            });
        } else {
            crawlLayout(object.props.children, func, newPath);
        }
    } else if (R.type(object) === 'Array') {
        /*
         * Sometimes when we're updating a sub-tree
         * (like when we're responding to a callback)
         * that returns `{children: [{...}, {...}]}`
         * then we'll need to start crawling from
         * an array instead of an object.
         */

        object.forEach((child, i) => {
            crawlLayout(child, func, R.append(i, path));
        });
    }
};

export function hasId(child) {
    return (
        R.type(child) === 'Object' &&
        R.has('props', child) &&
        R.has('id', child.props)
    );
}
