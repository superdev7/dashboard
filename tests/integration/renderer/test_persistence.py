from multiprocessing import Value

import dash
from dash.dependencies import Input, Output

import dash_html_components as html
import dash_table as dt


def table_columns(names, **extra_props):
    return [dict(
        id='c{}'.format(i),
        name=n,
        renamable=True,
        hideable=True,
        **extra_props
    ) for i, n in enumerate(names)]


def simple_table(names=('a', 'b'), **props_override):
    props = dict(
        id='table',
        columns=table_columns(names),
        data=[{'c0': 0, 'c1': 1}, {'c0': 2, 'c1': 3}],
        persistence=True
    )
    props.update(props_override)
    return dt.DataTable(**props)


def reloadable_app(**props_override):
    app = dash.Dash(__name__)
    app.persistence = Value('i', 1)

    def layout():
        return html.Div([
            html.Div(id='out'),
            simple_table(persistence=app.persistence.value, **props_override)
        ])
    app.layout = layout

    @app.callback(
        Output('out', 'children'),
        [Input('table', 'columns'), Input('table', 'hidden_columns')]
    )
    def report_props(columns, hidden_columns):
        return 'names: [{}]; hidden: [{}]'.format(
            ', '.join([col['name'] for col in columns]),
            ', '.join(hidden_columns or [])
        )

    return app

NEW_NAME = 'mango'


def rename_and_hide(dash_duo, rename=0, new_name=NEW_NAME, hide=1):
    dash_duo.find_element(
        '.dash-header.column-{} .column-header--edit'.format(rename)
    ).click()
    prompt = dash_duo.driver.switch_to.alert
    prompt.send_keys(new_name)
    prompt.accept()
    dash_duo.find_element(
        '.dash-header.column-{} .column-header--hide'.format(hide)
    ).click()


def check_table_names(dash_duo, names, table_id='table'):
    dash_duo.wait_for_text_to_equal(
        '#{} .column-0 .column-header-name'.format(table_id),
        names[0]
    )
    headers = dash_duo.find_elements('#{} .column-header-name'.format(table_id))
    assert len(headers) == len(names)

    for i, n in enumerate(names):
        name_el = dash_duo.find_element(
            '#{} .column-{} .column-header-name'.format(table_id, i)
        )
        assert name_el.text == n


def test_rdps001_local_reload(dash_duo):
    app = reloadable_app()
    dash_duo.start_server(app)
    dash_duo.wait_for_text_to_equal('#out', 'names: [a, b]; hidden: []')
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    # callback output
    dash_duo.wait_for_text_to_equal('#out', 'names: [{}, b]; hidden: [c1]'.format(NEW_NAME))
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.wait_for_page()
    # callback gets persisted values, not the values provided with the layout
    dash_duo.wait_for_text_to_equal('#out', 'names: [{}, b]; hidden: [c1]'.format(NEW_NAME))
    check_table_names(dash_duo, [NEW_NAME])

    # new persistence reverts
    app.persistence.value = 2
    dash_duo.wait_for_page()
    check_table_names(dash_duo, ['a', 'b'])
    rename_and_hide(dash_duo, 1, 'two', 0)
    dash_duo.wait_for_text_to_equal('#out', 'names: [a, two]; hidden: [c0]')
    check_table_names(dash_duo, ['two'])

    # put back the old persistence, get the old values
    app.persistence.value = 1
    dash_duo.wait_for_page()
    dash_duo.wait_for_text_to_equal('#out', 'names: [{}, b]; hidden: [c1]'.format(NEW_NAME))
    check_table_names(dash_duo, [NEW_NAME])

    # falsy persistence disables it
    app.persistence.value = 0
    dash_duo.wait_for_page()
    check_table_names(dash_duo, ['a', 'b'])
    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])
    dash_duo.wait_for_page()
    check_table_names(dash_duo, ['a', 'b'])

    # falsy to previous truthy also brings the values
    app.persistence.value = 2
    dash_duo.wait_for_page()
    dash_duo.wait_for_text_to_equal('#out', 'names: [a, two]; hidden: [c0]')
    check_table_names(dash_duo, ['two'])


def test_rdps002_session_reload(dash_duo):
    app = reloadable_app(persistence_type='session')
    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])
    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.wait_for_page()
    # callback gets persisted values, not the values provided with the layout
    dash_duo.wait_for_text_to_equal('#out', 'names: [{}, b]; hidden: [c1]'.format(NEW_NAME))
    check_table_names(dash_duo, [NEW_NAME])


def test_rdps003_memory_reload(dash_duo):
    app = reloadable_app(persistence_type='memory')
    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])
    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.wait_for_page()
    # no persistence after reload with persistence_type=memory
    check_table_names(dash_duo, ['a', 'b'])


def test_rdps004_show_hide(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([
        html.Button('Show/Hide', id='toggle-table'),
        html.Div(id='container')
    ])

    @app.callback(
        Output('container', 'children'),
        [Input('toggle-table', 'n_clicks')]
    )
    def toggle_table(n):
        if (n or 0) % 2:
            return 'nope'
        return simple_table(
            persistence_type='memory',
            persistence=1 if (n or 0) < 3 else 2
        )

    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.find_element('#toggle-table').click()
    # table is gone
    dash_duo.wait_for_text_to_equal('#container', 'nope')

    dash_duo.find_element('#toggle-table').click()
    # table is back, with persisted props
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.find_element('#toggle-table').click()
    # gone again
    dash_duo.wait_for_text_to_equal('#container', 'nope')

    dash_duo.find_element('#toggle-table').click()
    # table is back, new persistence val so props not persisted
    check_table_names(dash_duo, ['a', 'b'])


def test_rdps005_persisted_props(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([
        html.Button('toggle persisted_props', id='toggle-table'),
        html.Div(id='container')
    ])

    @app.callback(
        Output('container', 'children'),
        [Input('toggle-table', 'n_clicks')]
    )
    def toggle_table(n):
        if (n or 0) % 2:
            return simple_table(persisted_props=['data', 'columns.name'])
        return simple_table()

    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.find_element('#toggle-table').click()
    # hidden_columns not persisted
    check_table_names(dash_duo, [NEW_NAME, 'b'])

    dash_duo.find_element('#toggle-table').click()
    # back to original persisted_props hidden_columns returns
    check_table_names(dash_duo, [NEW_NAME])


def test_rdps006_move_on_page(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([
        html.Button('move table', id='move-table'),
        html.Div(id='container')
    ])

    @app.callback(
        Output('container', 'children'),
        [Input('move-table', 'n_clicks')]
    )
    def move_table(n):
        children = [html.Div('div 0', id='div0'), simple_table()]
        for i in range(1, (n or 0) + 1):
            children = [
                html.Div('div {}'.format(i), id='div{}'.format(i)),
                html.Div(children)
            ]
        return children

    def find_last_div(n):
        dash_duo.wait_for_text_to_equal('#div{}'.format(n), 'div {}'.format(n))
        assert len(dash_duo.find_elements('#div{}'.format(n + 1))) == 0

    dash_duo.start_server(app)
    find_last_div(0)
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    for i in range(1, 5):
        dash_duo.find_element('#move-table').click()
        find_last_div(i)
        check_table_names(dash_duo, [NEW_NAME])


def test_rdps007_one_prop_changed(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([
        html.Button('hide/show cols', id='hide-cols'),
        html.Div(id='container')
    ])

    @app.callback(
        Output('container', 'children'),
        [Input('hide-cols', 'n_clicks')]
    )
    def hide_cols(n):
        return simple_table(hidden_columns=['c0'] if (n or 0) % 2 else [])

    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.find_element('#hide-cols').click()
    # hidden_columns gets the new value
    check_table_names(dash_duo, ['b'])

    dash_duo.find_element('#hide-cols').click()
    # back to original hidden_columns, but saved value won't come back
    check_table_names(dash_duo, [NEW_NAME, 'b'])


def test_rdps008_unsaved_part_changed(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([
        html.Button('toggle deletable', id='deletable'),
        html.Div(id='container')
    ])

    @app.callback(
        Output('container', 'children'),
        [Input('deletable', 'n_clicks')]
    )
    def toggle_deletable(n):
        if (n or 0) % 2:
            return simple_table(
                columns=table_columns(('a', 'b'), deletable=True)
            )
        return simple_table()

    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])
    assert len(dash_duo.find_elements('.column-header--delete')) == 0

    dash_duo.find_element('#deletable').click()
    # column names still persisted when columns.deletable changed
    # because extracted name list didn't change
    check_table_names(dash_duo, [NEW_NAME])
    assert len(dash_duo.find_elements('.column-header--delete')) == 1

    dash_duo.find_element('#deletable').click()
    check_table_names(dash_duo, [NEW_NAME])
    assert len(dash_duo.find_elements('.column-header--delete')) == 0


def test_rdps009_clear_prop_callback(dash_duo):
    app = dash.Dash(__name__)
    app.layout = html.Div([
        html.Button('reset name edits', id='reset-names'),
        simple_table()
    ])

    @app.callback(
        Output('table', 'columns'),
        [Input('reset-names', 'n_clicks')]
    )
    def reset_names(n):
        # callbacks that return the actual persisted prop, as opposed to
        # the whole component containing them, always clear persistence, even
        # if the value is identical to the original. no_update can prevent this.
        # if we had multiple inputs, would need to check triggered
        return table_columns(('a', 'b')) if n else dash.no_update

    dash_duo.start_server(app)
    check_table_names(dash_duo, ['a', 'b'])

    rename_and_hide(dash_duo)
    check_table_names(dash_duo, [NEW_NAME])

    dash_duo.find_element('#reset-names').click()
    # names are reset, but not hidden_columns
    check_table_names(dash_duo, ['a'])
