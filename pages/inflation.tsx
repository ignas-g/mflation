import Head from 'next/head'
import styles from '../styles/Home.module.css'
import React, {Component} from 'react'
import _ from 'lodash'
import axios from 'axios'
import {FlexibleWidthXYPlot, HorizontalGridLines, LineSeries, MarkSeries, XAxis, YAxis} from 'react-vis'
import {periods} from '../lib/util/dates';
import DayPickerInput from 'react-day-picker/DayPickerInput';
import 'react-day-picker/lib/style.css';
import moment from 'moment';
// @ts-ignore
import {formatDate, parseDate} from 'react-day-picker/moment';
import Helmet from 'react-helmet';
import {calculateInflation} from './api/inflation';
import MapComponent from '../components/map-component';
import DropdownTreeSelect from 'react-dropdown-tree-select';
import 'react-dropdown-tree-select/dist/styles.css';
import data from '../data/categories';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Image from "next/dist/client/image";
import Button from "@mui/material/Button";
import CachedIcon from '@mui/icons-material/Cached';
import MenuItem from "@mui/material/MenuItem";
import Select from "@material-ui/core/Select";
import {Box, CircularProgress, FormControlLabel, Radio, RadioGroup, Alert} from '@mui/material';


export async function getServerSideProps() {
    const resultObject = await calculateInflation({});
    const apiKey: string = (process.env as any).GOOGLE_MAPS_API_KEY as string;
    return {
        props: {resultObject, apiKey}, // will be passed to the page component as props
    }
}


class Inflation extends Component<any, any> {
    constructor(props: any) {
        super(props);
        this.state = {
            column: null,
            inflationInDayPercent: props.resultObject.inflationInDayPercent,
            direction: null,
            errors: null,
            from: props.resultObject.from,
            to: props.resultObject.to,
            lat: 37.09024,
            lng: -95.712891,
            radius: 1900,
            inProgress: false,
            error: null,
            period: periods.Daily.name,
            basket: ['Food and beverages', 'Housing', 'Apparel', 'Transportation', 'Medical care', 'Recreation', 'Education and communication', 'Other goods and services'],
        };

        this.handleChange = this.handleChange.bind(this);
        this.handleReload(this.state);
        this.handleFromChange = this.handleFromChange.bind(this);
        this.handleToChange = this.handleToChange.bind(this);
    }


    onChange(currentNode, selectedNodes) {
        console.log('onChange::', currentNode, selectedNodes);
        let basket: string[] = [];
        _.map(selectedNodes, (item: any) => {
            basket.push(item.label);
        });
        this.setState({basket});
    }

    onAction(node, action) {
        console.log('onAction::', action, node)
    }

    onNodeToggle(currentNode) {
        console.log('onNodeToggle::', currentNode)
    }


    showFromMonth() {
        let {from, to} = this.state as any;
        from = new Date(from);
        to = new Date(to);
        if (!from) {
            return;
        }
        if (moment(to).diff(moment(from), 'months') < 2) {
            (this as any).to.getDayPicker().showMonth(from);
        }
    }

    handleFromChange(from) {
        // Change the from date and focus the "to" input field
        this.setState({from});
    }

    handleToChange(to) {
        this.setState({to}, this.showFromMonth);
    }

    handleChange = (e: any) => {
        this.setState({
            ...this.state,
            [e.target.name]: e.target.value
        });
    };

    handlePeriodChange = (e) => {
        this.setState({
            ...this.state,
            period: e.target.value
        });
    }

    buildQueryURL = (state) => {
        return ['from', 'to', 'aggregate', 'lat', 'lng', 'radius', 'basket', 'period'].reduce((str, key) => {
            if (!state[key]) {
                return str;
            }
            if (str !== '') {
                str += '&';
            }

            if (key === 'basket') {
                str += key + '=' + encodeURIComponent(JSON.stringify(state[key]));
                return str;
            }

            str += key + '=' + encodeURIComponent(state[key]);
            return str;
        }, '');
    };

    tryGetErrorMessage(error) {
        try {
            if(error?.response?.data?.message) {
                return error?.response?.data?.message;
            }
            return JSON.parse(error?.response?.data);
        } catch (e) {
            return error.toString();
        }
    }

    handleReload = (state) => {
        let errors: any = ['radius', 'lng', 'lat'].reduce((errors, key) => {
            if (!state[key]) {
                return errors;
            }
            try {
                JSON.parse(state[key]);
            } catch (e) {
                errors[key] = (e as any).toString();
            }
            return errors;
        }, {});
        if (_.isEmpty(errors)) {
            errors = null;
        } else {
            this.setState({
                ...state,
                errors
            });
            return;
        }

        this.setState({
            ...state,
            error: null,
            inProgress: true
        });

        // Make a request for a user with a given ID
        axios.get('/api/inflation' + '?' + this.buildQueryURL(state))
            .then((response) => {
                // handle success
                this.setState({
                    ...state,
                    errors,
                    error: null,
                    inProgress: false,
                    inflationInDayPercent: response.data.inflationInDayPercent,
                    inflationOnLastDay: response.data.inflationOnLastDay,
                    from: response.data.from,
                    to: response.data.to,
                    country: response.data.country
                });
            }).catch((error) => {
            this.setState({
                ...state,
                error: this.tryGetErrorMessage(error),
                inProgress: false,
                data: []
            });
        });
    };

    updateToMatch = (item, basket) => {
        item.checked = (basket.indexOf(item.label) !== -1);
        if (item.children) {
            item.children.forEach((c) => {
                this.updateToMatch(c, basket);
            });
        }
    };

    render = () => {
        const {
            inflationInDayPercent,
            inflationOnLastDay,
            country,
            errors,
            lat,
            lng,
            radius,
            basket,
            period,
            inProgress,
            error
        } = this.state as any;
        const that = this;
        let {from, to} = this.state as any;
        from = new Date(from);
        to = new Date(to);
        const days = Object.keys(inflationInDayPercent).sort();
        this.updateToMatch(data, basket);

        const modifiers = {start: from, end: to};

        let chart: any;


        // If it is an array we can show a table
        let categories = {};
        categories[country] = [];
        days.forEach((day) => {
            categories[country].push({x: day, y: !inflationInDayPercent[day] ? 0 : inflationInDayPercent[day]})
        });

        const series = _.map(categories, (value, key) => {
            return (
                <LineSeries
                    data={value} key={key}/>
            )
        });


        const calculateTickLabelAngle = () => {
            if (days.length < 10) {
                return 0;
            }

            if (days.length > 40) {
                return -90;
            }

            return -25;

        }

        const style = {width: '100%', 'margin-bottom': '100px'};
        const boxStyle = {display: 'flex', 'align-items': 'center', 'justify-content': 'center'};

        chart = (
            <div style={style} className={styles.inflation}>
                <h3>
                    <div className={styles["header-image"]}><Image src='/usa-flag.png' width='20px' height='20px'
                                                                   alt={'USA Flag'}/></div>
                    <Select
                        labelId="demo-simple-select-label"
                        id="demo-simple-select"
                        label="Country"
                        defaultValue={10}
                        className={styles["MuiSelect-select"]}
                    >
                        <MenuItem value={10}>USA</MenuItem>
                        <MenuItem value={20} disabled={true}>More Countries Coming Soon...</MenuItem>
                    </Select> {' '}
                    Inflation - {inflationOnLastDay || 0}% compared to last day
                </h3>
                <Accordion>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon/>}
                        aria-controls="panel1a-content"
                        id="panel1a-header"
                    >
                        <Typography>Area</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <div className={styles.inputs}>
                            <span className={styles.error}>{errors && errors["lng"]}</span>
                            <p>Area to calculate inflation in (US only for now):</p>
                            <span>Longitude</span>
                            <span className={styles.error}>{errors && errors["lng"]}</span>
                            <input name='lng' onChange={this.handleChange} value={lng}/>
                            <span>Latitude</span>
                            <span className={styles.error}>{errors && errors["lat"]}</span>
                            <input name='lat' onChange={this.handleChange} value={lat}/>
                            <span>Distance (miles)</span>
                            <span className={styles.error}>{errors && errors["radius"]}</span>
                            <input name='radius' onChange={this.handleChange} value={radius}/>
                        </div>
                        <div style={{position: 'relative', height: '500px'}}>
                            <MapComponent lat={lat} lng={lng} radius={radius * 1609.34} apiKey={this.props.apiKey}/>
                        </div>
                    </AccordionDetails>
                </Accordion>
                <Accordion>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon/>}
                        aria-controls="panel2a-content"
                        id="panel2a-header"
                    >
                        <Typography>Goods Basket</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <DropdownTreeSelect data={data} onChange={that.onChange.bind(that)} onAction={this.onAction}
                                            onNodeToggle={this.onNodeToggle}/>
                    </AccordionDetails>
                </Accordion>
                <Accordion>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon/>}
                        aria-controls="panel2a-content"
                        id="panel2a-header"
                    >
                        <Typography>Frequency</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <RadioGroup row aria-label="frequency" name="row-radio-buttons-group" value={period}
                                    onChange={this.handlePeriodChange}>
                            {Object.keys(periods).map((p) => {
                                return (<FormControlLabel value={p} control={<Radio/>} label={p}/>);
                            })}
                        </RadioGroup>
                    </AccordionDetails>
                </Accordion>
                <Accordion>
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon/>}
                        aria-controls="panel2a-content"
                        id="panel2a-header"
                    >
                        <Typography>Dates Period</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <div className="InputFromTo">
                            <DayPickerInput
                                value={from}
                                placeholder="From"
                                format="LL"
                                formatDate={formatDate}
                                parseDate={parseDate}
                                dayPickerProps={{
                                    selectedDays: [from, {from, to}],
                                    disabledDays: {after: new Date()},
                                    toMonth: to,
                                    modifiers,
                                    numberOfMonths: 2,
                                    onDayClick: () => (this as any).to.getInput().focus(),
                                }}
                                onDayChange={this.handleFromChange}
                            />{' '}
                            —{' '}
                            <span className="InputFromTo-to">
          <DayPickerInput
              ref={el => ((this as any).to = el)}
              value={to}
              placeholder="To"
              format="LL"
              formatDate={formatDate}
              parseDate={parseDate}
              dayPickerProps={{
                  selectedDays: [from, {from, to}],
                  disabledDays: {before: from},
                  modifiers,
                  month: from,
                  fromMonth: from,
                  numberOfMonths: 2,
              }}
              onDayChange={this.handleToChange}
          />
        </span>
                            <Helmet>
                                <style>{`
  .InputFromTo .DayPicker-Day--selected:not(.DayPicker-Day--start):not(.DayPicker-Day--end):not(.DayPicker-Day--outside) {
    background-color: #f0f8ff !important;
    color: #4a90e2;
  }
  .InputFromTo .DayPicker-Day {
    border-radius: 0 !important;
  }
  .InputFromTo .DayPicker-Day--start {
    border-top-left-radius: 50% !important;
    border-bottom-left-radius: 50% !important;
  }
  .InputFromTo .DayPicker-Day--end {
    border-top-right-radius: 50% !important;
    border-bottom-right-radius: 50% !important;
  }
  .InputFromTo .DayPickerInput-Overlay {
    width: 550px;
  }
  .InputFromTo-to .DayPickerInput-Overlay {
    margin-left: -198px;
  }
`}</style>
                            </Helmet>
                        </div>
                    </AccordionDetails>
                </Accordion>
                <div className={styles.recalculateButton}>
                    {error?(<div style={{margin:'10px'}}><Alert severity="error">{error}</Alert></div>):null}
                    <Button onClick={() => this.handleReload(this.state)} variant="contained" endIcon={<CachedIcon/>}>
                        Recalculate Inflation
                    </Button>
                </div>
                {inProgress ? (<Box style={boxStyle}><CircularProgress/></Box>) : (<FlexibleWidthXYPlot
                    xType="ordinal"
                    style={{'margin-bottom': '80px', overflow: 'visible'}}
                    height={300}>
                    <HorizontalGridLines/>
                    {series}
                    <XAxis tickLabelAngle={calculateTickLabelAngle()}/>
                    <YAxis/>
                    <MarkSeries data={[{x: days[0], y: 0},{x: days[0], y: 0.1},{x: days[0], y: -0.1}]} style={{display: 'none'}}/>
                </FlexibleWidthXYPlot>)}
            </div>);

        return (
            <div className={styles.container}>
                <Head>
                    <title>Crowdflation - Crowdsourced Inflation Calculation</title>
                </Head>
                {chart}
            </div>
        )
    }
}

export default Inflation;
