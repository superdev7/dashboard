from multiprocessing import Value, Lock

import dash
from dash.dependencies import Input, Output
from dash.exceptions import PreventUpdate

import dash_core_components as dcc
import dash_html_components as html


def test_rdmo001_single_input_multi_outputs_on_multiple_components(dash_duo):
    call_count = Value("i")

    app = dash.Dash(__name__)

    N_OUTPUTS = 50

    app.layout = html.Div(
        [html.Button("click me", id="btn")]
        + [html.Div(id="output-{}".format(i)) for i in range(N_OUTPUTS)]
    )

    @app.callback(
        [Output("output-{}".format(i), "children") for i in range(N_OUTPUTS)],
        [Input("btn", "n_clicks")],
    )
    def update_output(n_clicks):
        if n_clicks is None:
            raise PreventUpdate

        call_count.value += 1
        return ["{}={}".format(i, i + n_clicks) for i in range(N_OUTPUTS)]

    dash_duo.start_server(app)

    btn = dash_duo.wait_for_element("#btn")

    for click in range(1, 20):
        btn.click()

        for i in range(N_OUTPUTS):
            dash_duo.wait_for_text_to_equal(
                "#output-{}".format(i), "{}={}".format(i, i + click)
            )

        assert call_count.value == click


def test_rdmo002_multi_outputs_on_single_component(dash_duo):
    call_count = Value("i")
    app = dash.Dash(__name__)

    app.layout = html.Div(
        [
            dcc.Input(id="input", value="dash"),
            html.Div(html.Div(id="output"), id="output-container"),
        ]
    )

    @app.callback(
        [
            Output("output", "children"),
            Output("output", "style"),
            Output("output", "className"),
        ],
        [Input("input", "value")],
    )
    def update_output(value):
        call_count.value += 1
        return [value, {"fontFamily": value}, value]

    dash_duo.start_server(app)

    dash_duo.wait_for_text_to_equal("#output-container", "dash")
    _html = dash_duo.find_element("#output-container").get_property("innerHTML")
    assert _html == (
        '<div id="output" class="dash" style="font-family: dash;">dash</div>'
    )

    assert call_count.value == 1

    dash_duo.find_element("#input").send_keys(" hello")

    dash_duo.wait_for_text_to_equal("#output-container", "dash hello")
    _html = dash_duo.find_element("#output-container").get_property("innerHTML")
    assert _html == (
        '<div id="output" class="dash hello" '
        'style="font-family: &quot;dash hello&quot;;">dash hello</div>'
    )

    assert call_count.value == 7


def test_rdmo003_single_output_as_multi(dash_duo):
    app = dash.Dash(__name__)

    app.layout = html.Div(
        [
            dcc.Input(id="input", value=""),
            html.Div(html.Div(id="output"), id="output-container"),
        ]
    )

    @app.callback([Output("output", "children")], [Input("input", "value")])
    def update_output(value):
        return ["out" + value]

    dash_duo.start_server(app)

    dash_duo.find_element("#input").send_keys("house")
    dash_duo.wait_for_text_to_equal("#output", "outhouse")


def test_rdmo004_multi_output_circular_dependencies(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([dcc.Input(id="a"), dcc.Input(id="b"), html.P(id="c")])

    @app.callback(Output("a", "value"), [Input("b", "value")])
    def set_a(b):
        return ((b or "") + "X")[:100]

    @app.callback(
        [Output("b", "value"), Output("c", "children")], [Input("a", "value")]
    )
    def set_bc(a):
        return [a, a]

    dash_duo.start_server(
        app,
        debug=True,
        use_debugger=True,
        use_reloader=False,
        dev_tools_hot_reload=False,
    )

    # the UI still renders the output triggered by callback.
    # The new system does NOT loop infinitely like it used to, each callback
    # is invoked no more than once.
    dash_duo.wait_for_text_to_equal("#c", "X")

    err_text = dash_duo.find_element("span.dash-fe-error__title").text
    assert err_text == "Circular Dependencies"


def test_rdmo005_set_props_behavior(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div(
        [
            dcc.Input(id="id", value=""),
            html.Div(id="container", children=dcc.Input(value=""),),
        ]
    )

    dash_duo.start_server(
        app,
        debug=True,
        use_reloader=False,
        use_debugger=True,
        dev_tools_hot_reload=False,
    )

    dash_duo.find_element("#id").send_keys("hello input with ID")
    dash_duo.wait_for_text_to_equal("#id", "hello input with ID")

    dash_duo.find_element("#container input").send_keys("hello input w/o ID")
    dash_duo.wait_for_text_to_equal("#container input", "hello input w/o ID")


def test_rdmo006_multi_loading_components(dash_duo):
    lock = Lock()

    app = dash.Dash(__name__)

    app.layout = html.Div(
        children=[
            html.H3("Edit text input to see loading state"),
            dcc.Input(id="input-3", value='Input triggers the loading states'),
            dcc.Loading(className="loading-1", children=[
                html.Div(id="loading-output-1")
            ], type="default"),
            html.Div(
                [
                    dcc.Loading(
                        className="loading-2",
                        children=[html.Div([html.Div(id="loading-output-2")])],
                        type="circle",
                    ),
                    dcc.Loading(
                        className="loading-3",
                        children=dcc.Graph(id='graph'),
                        type="cube",
                    )
                ]
            ),
        ],
    )

    @app.callback(
        [
            Output("graph", "figure"),
            Output("loading-output-1", "children"),
            Output("loading-output-2", "children"),
        ],
        [Input("input-3", "value")])
    def input_triggers_nested(value):
        with lock:
            return dict(data=[dict(y=[1, 4, 2, 3])]), value, value

    def wait_for_all_spinners():
        dash_duo.find_element('.loading-1 .dash-spinner.dash-default-spinner')
        dash_duo.find_element('.loading-2 .dash-spinner.dash-sk-circle')
        dash_duo.find_element('.loading-3 .dash-spinner.dash-cube-container')

    def wait_for_no_spinners():
        dash_duo.wait_for_no_elements('.dash-spinner')

    with lock:
        dash_duo.start_server(app)
        wait_for_all_spinners()

    wait_for_no_spinners()

    with lock:
        dash_duo.find_element('#input-3').send_keys('X')
        wait_for_all_spinners()

    wait_for_no_spinners()
