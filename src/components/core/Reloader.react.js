/* eslint-disable no-undef */
import R from 'ramda';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux'
import {getReloadHash} from "../../actions/api";

class Reloader extends React.Component {
    constructor(props) {
        super(props);
        if (props.config.hot_reload) {
            const { interval } = props.config.hot_reload;
            this.state = {
                hash: null,
                interval,
                disabled: false,
                intervalId: null,
                packages: null
            }
        } else {
            this.state = {
                disabled: true
            }
        }
        this._head = document.querySelector('head');
    }

    componentDidUpdate() {
        const {reloadRequest, dispatch} = this.props;
        if (reloadRequest.status === 200) {
            if (this.state.hash === null) {
                this.setState({
                    hash: reloadRequest.content.reloadHash,
                    packages: reloadRequest.content.packages
                });
                return;
            }
            if (reloadRequest.content.reloadHash !== this.state.hash) {
                window.clearInterval(this._intervalId);
                if (reloadRequest.content.hard
                    || reloadRequest.content.packages.length !== this.state.length
                    || !R.all(R.map(x => R.contains(x, this.state.packages),
                        reloadRequest.content.packages))
                ) {
                    // Look if it was a css file.
                    let was_css = false;
                    for (let a of reloadRequest.content.files) {
                        if (a.is_css) {
                            was_css = true;
                            const nodesToDisable = [];

                            // Search for the old file by xpath.
                            const it = document.evaluate(
                                `//link[contains(@href, "${a.url}")]`,
                                this._head
                            );
                            let node = it.iterateNext();

                            while (node) {
                                nodesToDisable.push(node);
                                node = it.iterateNext();
                            }
                            nodesToDisable.forEach(
                                n => n.setAttribute('disabled', 'disabled'));

                            const link = document.createElement('link');
                            link.href = `${a.url}?m=${a.modified}`;
                            link.type = 'text/css';
                            link.rel = 'stylesheet';
                            this._head.appendChild(link);
                        } else {
                            // If there's another kind of file here do a hard reload.
                            was_css = false;
                            break;
                        }
                    }
                    if (!was_css) {
                        // Assets file have changed
                        // or a component lib has been added/removed
                        window.top.location.reload();
                    } else {
                        // Since it's only a css reload,
                        // we just change the hash.
                        this.setState({
                            hash: reloadRequest.content.reloadHash
                        })
                    }
                } else {
                    dispatch({'type': 'RELOAD'});
                }
            }
        }
    }

    componentWillMount() {

    }

    componentDidMount() {
        const { dispatch } = this.props;
        const { disabled, interval } = this.state;
        if (!disabled && !this.state.intervalId) {
            const intervalId = setInterval(() => {
                dispatch(getReloadHash());
            }, interval);
            this.setState({intervalId})
        }
    }

    componentWillUnmount() {
        if (!this.state.disabled && this.state.intervalId) {
            window.clearInterval(this.state.intervalId);
        }
    }

    render() {
        return null;
    }
}

Reloader.defaultProps = {};

Reloader.propTypes = {
    id: PropTypes.string,
    config: PropTypes.object,
    reloadRequest: PropTypes.object,
    dispatch: PropTypes.func,
    interval: PropTypes.number,
    packagesRequest: PropTypes.object,
};

export default connect(
    state => ({
        config: state.config,
        reloadRequest: state.reloadRequest,
        packagesRequest: state.packagesRequest
    }),
    dispatch => ({dispatch})
)(Reloader);
 