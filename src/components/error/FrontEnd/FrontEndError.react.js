import './FrontEndError.css';
import {Component} from 'react';
import ErrorIcon from '../icons/ErrorIcon.svg';
import CloseIcon from '../icons/CloseIcon.svg';
import CollapseIcon from '../icons/CollapseIcon.svg';
import PropTypes from 'prop-types';
import {has} from 'ramda';

import werkzeugCss from '../werkzeug.css.txt';

class FrontEndError extends Component {
    constructor(props) {
        super(props);
        this.state = {
            collapsed: this.props.isListItem,
        };
    }

    render() {
        const {e, resolve, inAlertsTray} = this.props;
        const {collapsed} = this.state;

        let closeButton, cardClasses;
        // if resolve is defined, the error should be a standalone card
        if (resolve) {
            closeButton = (
                <CloseIcon
                    className="dash-fe-error__icon-close"
                    onClick={() => resolve('frontEnd', e.myUID)}
                />
            );
            cardClasses = 'dash-error-card';
        } else {
            cardClasses = 'dash-error-card__content';
        }
        if (inAlertsTray) {
            cardClasses += ' dash-error-card--alerts-tray';
        }

        const errorHeader = (
            <div className="dash-fe-error-top" onClick={() => this.setState({collapsed: !collapsed})}>
                <span className="dash-fe-error-top__group">
                    <ErrorIcon className="dash-fe-error__icon-error" />

                    <span className="dash-fe-error__title">
                        {e.error.message || 'Error'}
                    </span>
                </span>

                <span className="dash-fe-error-top__group">
                    <span className="dash-fe-error__timestamp">
                        {`${e.timestamp.toLocaleTimeString()}`}
                    </span>

                    <CollapseIcon
                        className={`dash-fe-error__collapse ${collapsed ? 'dash-fe-error__collapse--flipped' : ''}`}
                        onClick={() => this.setState({collapsed: !collapsed})}
                    />
                </span>
            </div>
        );

        return collapsed ? (
            <div className="dash-error-card__list-item">
                {errorHeader}
            </div>
        ) : (
            <div className={cardClasses}>
                {errorHeader}

                <ErrorContent error={e.error}/>

            </div>
        );

    }
}

function ErrorContent({error}) {
    return (
        <div className='error-container'>
        {/* Frontend Error objects */}
        {!error.stack ? null: (
            <div className="dash-fe-error__st">
                {error.stack.split('\n').map(line => <p>{line}</p>)}
            </div>
        )}

        {/* Backend Error */}
        {!error.html ? null : (
            <div className="dash-be-error__st">
                <div className="dash-backend-error">
                    {/* Embed werkzeug debugger in an iframe to prevent
                        CSS leaking - werkzeug HTML includes a bunch
                        of CSS on base html elements like `<body/>`
                      */}

                    <iframe
                        srcDoc={error.html.replace(
                            '</head>',
                            `<style type="text/css">${werkzeugCss}</style></head>`
                        )}
                        style={{
                            /*
                             * 67px of padding and margin between this
                             * iframe and the parent container.
                             * 67 was determined manually in the
                             * browser's dev tools.
                             */
                            'width': 'calc(600px - 67px)',
                            'height': '75vh',
                            'border': 'none'
                        }}
                    />
                </div>
            </div>
        )}
        </div>
    );
}


FrontEndError.propTypes = {
    e: PropTypes.shape({
        myUID: PropTypes.string,
        timestamp: PropTypes.object,
        error: PropTypes.shape({
            message: PropTypes.string,

            /* front-end error messages */
            stack: PropTypes.string,

            /* backend error messages */
            html: PropTypes.string,


        })
    }),
    resolve: PropTypes.func,
    inAlertsTray: PropTypes.bool,
    isListItem: PropTypes.bool,
};

FrontEndError.defaultProps = {
    inAlertsTray: false,
    isListItem: false,
};

export {FrontEndError};
