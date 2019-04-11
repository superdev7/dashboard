import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {isEmpty} from 'ramda';
import {FrontEndError} from './FrontEnd/FrontEndError.react';
import './GlobalErrorOverlay.css';
import {FrontEndErrorContainer} from './FrontEnd/FrontEndErrorContainer.react';

export default class GlobalErrorOverlay extends Component {
    constructor(props) {
        super(props);
    }

    render() {
        const {resolve, visible, error, toastsEnabled} = this.props;
        let frontEndErrors;
        if (toastsEnabled) {
            let errors = [];
            if (error.frontEnd.length) {
                errors = error.frontEnd;
            }

            error.backEnd.forEach(backEndError => {
                errors.push(backEndError);
            });

            frontEndErrors = (
                <FrontEndErrorContainer
                    errors={errors}
                    resolve={resolve}
                />
            );
        }
        return (
            <div>
                <div>{this.props.children}</div>
                <div className="dash-error-menu">
                    <div className={visible ? 'dash-fe-errors' : ''}>
                        {frontEndErrors}
                    </div>
                </div>
            </div>
        );
    }
}

GlobalErrorOverlay.propTypes = {
    children: PropTypes.object,
    resolve: PropTypes.func,
    visible: PropTypes.bool,
    error: PropTypes.object,
    toastsEnabled: PropTypes.boolean,
};
