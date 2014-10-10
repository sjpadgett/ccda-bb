/*
This script converts CCDA data in JSON format (originally generated from a Continuity of Care Document (CCD) in 
standard XML/CCDA format) back to XML/CCDA format. The script determines the 
section template to which the data belongs to by matching on its object properties (the determineSection function). 

Two different functions allow for the upload of data that belongs only to a single section, or data for all sections
in a CCD-A document (gen() vs. genWholeCCDA()). This aids in unit testing the individual sections for accuracy, even though
in reality we do not need support for this.

When the section has been determined, it is used to summon appropriate templating file from lib/generator/templates, which then
generates the appropriate XML using the libxmljs Document API.

In the case of compiling a whole CCD-A document, these individual sections are strung together and returned as one single
document.
*/

var libxmljs = require("libxmljs");
var libCCDAGen = require("./lib/templating_functions.js");
var bbm = require('blue-button-meta');
var codeSystems = bbm.CCDA.codeSystems; // maps code systems names to code system IDs

var js2xml = require('./lib/templates/js2xml');
var sectionLevel = require('./lib/templates/sectionLevel');

// Map section number to section name. 
var sectionNames = {
    0: "null",
    1: "demographics",
    2: "allergies",
    3: "encounters",
    4: "immunizations",
    5: "medications",
    6: "payers",
    7: "plan_of_care",
    8: "problems",
    9: "procedures",
    10: "results",
    11: "social_history",
    12: "vitals"
};

/*
Generates CCD-A from JSON data. 
@data is the data for a specific CCD section.
@CCD boolean parameteres indicating if it is an entire CCD or only individual section
@xmlDoc the previously generated CCDA/XML if generating an entire CCD
@section_name specifies the section template to call to generate the XML for that section
*/

var gen = function (data, CCD, xmlDoc, section_name) {
    if (data) {
        if (section_name === "demographics") {
            return require('./lib/demographics.js')(data, codeSystems, CCD, xmlDoc);
        } else if (section_name === "allergies") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.allergiesSectionEntriesRequired);
        } else if (section_name === "encounters") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.encountersSectionEntriesRequired);
        } else if (section_name === "immunizations") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.immunizationsSectionEntriesRequired);
        } else if (section_name === "medications") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.medicationsSectionEntriesRequired);
        } else if (section_name === "payers") {
            return require('./lib/payers.js')(data, codeSystems, CCD, xmlDoc);
        } else if (section_name === "plan_of_care") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.planOfCareSectionEntriesRequired);
        } else if (section_name === "problems") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.problemsSectionEntriesRequired);
        } else if (section_name === "procedures") {
            js2xml.fillUsingTemplate(xmlDoc, data, sectionLevel.proceduresSectionEntriesRequired);
        } else if (section_name === "results") {
            return require('./lib/results.js')(data, codeSystems, CCD, xmlDoc);
        } else if (section_name === "social_history") {
            return require('./lib/social_history.js')(data, codeSystems, CCD, xmlDoc);
        } else if (section_name === "vitals") {
            return require('./lib/vitals.js')(data, codeSystems, CCD, xmlDoc);
        }
    } else {
        return xmlDoc;
    }
};

/*
Generates an entire CCD-A document. Uses gen() to string together the individual CCD-A sections. First, it generates
the CCD-A header, then iterates through all the section templates, stringing them 
together one after another.

@data the entire CCD-A JSON data to be converted to XML/CCDA
*/
var genWholeCCDA = function (data) {
    var meta = data.meta;
    if (data.data) {
        data = data.data;
    }

    var doc = new libxmljs.Document();

    // generate the header 
    var xmlDoc = doc.node('ClinicalDocument')
        .attr({
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            xmlns: "urn:hl7-org:v3",
            "xmlns:cda": "urn:hl7-org:v3",
            "xmlns:sdtc": "urn:hl7-org:sdtc"
        });
    xmlDoc.node('realmCode').attr({
        code: "US"
    });
    xmlDoc.node('typeId').attr({
        root: "2.16.840.1.113883.1.3",
        extension: "POCD_HD000040"
    });
    xmlDoc.node('templateId').attr({
        root: "2.16.840.1.113883.10.20.22.1.1"
    });
    xmlDoc.node('templateId').attr({
        root: "2.16.840.1.113883.10.20.22.1.2"
    });

    libCCDAGen.id(xmlDoc, meta && meta.identifiers);

    xmlDoc.node('code').attr({
        codeSystem: "2.16.840.1.113883.6.1",
        codeSystemName: "LOINC",
        code: "34133-9",
        displayName: "Summarization of Episode Note"
    });
    xmlDoc.node('title', "Community Health and Hospitals: Health Summary");
    xmlDoc.node('effectiveTime').attr({
        value: "TODO"
    });
    xmlDoc.node('confidentialityCode').attr({
        code: "N",
        codeSystem: "2.16.840.1.113883.5.25"
    });
    xmlDoc.node('languageCode').attr({
        code: "en-US"
    });
    xmlDoc.node('setId').attr({
        extension: "sTT988",
        root: "2.16.840.1.113883.19.5.99999.19"
    });
    xmlDoc.node('versionNumber').attr({
        value: "1"
    });
    var pr = xmlDoc.node('recordTarget').node('patientRole');

    libCCDAGen.id(pr, data.demographics && data.demographics.identifiers);

    // generate demographics section
    gen(data[sectionNames[1]], true, pr, sectionNames[1]);

    // count the number of sections defined
    var count_sections = 0;
    for (var sections in data) {
        if (sections !== "demographics") {
            count_sections++;
        }
    }

    // if there are more sections than just demographics, then generate them
    if (count_sections > 0) {
        var sb = xmlDoc.node('component').node('structuredBody');
        // loop over all the sections and generate each one, adding them iteratively to each other
        for (var i = 2; i < Object.keys(sectionNames).length; i++) {
            if ((sectionNames[i] === 'plan_of_care') || (sectionNames[i] === 'procedures') || (sectionNames[i] === 'encounters') || (sectionNames[i] === 'allergies') || (sectionNames[i] === 'medications') || (sectionNames[i] === 'immunizations') || (sectionNames[i] === 'problems')) {
                gen(data, true, sb, sectionNames[i]);
            } else {
                gen(data[sectionNames[i]], true, sb, sectionNames[i]);
            }
        }
        return doc.toString();
    }
};

module.exports.section = gen;
module.exports = genWholeCCDA;
