import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import { addToolbarToDropdown, createDropdown } from '@ckeditor/ckeditor5-ui/src/dropdown/utils';
import LabeledFieldView from '@ckeditor/ckeditor5-ui/src/labeledfield/labeledfieldview';
import { createLabeledInputText } from '@ckeditor/ckeditor5-ui/src/labeledfield/utils';
import ButtonView from '@ckeditor/ckeditor5-ui/src/button/buttonview';
import KeystrokeHandler from '@ckeditor/ckeditor5-utils/src/keystrokehandler';
import FocusTracker from '@ckeditor/ckeditor5-utils/src/focustracker';
import ViewCollection from '@ckeditor/ckeditor5-ui/src/viewcollection';
import FocusCycler from '@ckeditor/ckeditor5-ui/src/focuscycler';
import searchIcon from '../theme/icons/loupe.svg';
import { removeSearchMarkers } from './utils';

export default class FindReplaceUI extends Plugin {
    /**
     * @inheritDoc
     */
    static get pluginName() {
        return 'FindReplaceUI';
    }

    /**
     * @inheritDoc
     */
    constructor( editor ) {
        super( editor );
    }

    /**
     * @inheritDoc
     */
    init() {
        const editor = this.editor;

        // Setup `findReplace` plugin button.
        editor.ui.componentFactory.add( 'findReplace', locale => {
            const dropdown = createDropdown( locale );
            const t = editor.t;
            this.findInput = new LabeledFieldView( this.locale, createLabeledInputText );
            const inputField = this.findInput.fieldView;
            inputField.placeholder = t( 'Enter: next; Shift+Enter: previous' );
            this.findInput.label = t( 'Find' );

            this.replaceInput = new LabeledFieldView( this.locale, createLabeledInputText );
            const replaceField = this.replaceInput.fieldView;
            replaceField.placeholder = t( 'Enter: replace; Ctrl+Enter: all' );
            this.replaceInput.label = t( 'Replace' );
            this._setUpDropdown( dropdown, this.findInput, this.replaceInput, editor );

            return dropdown;
        } );

    }

    /**
     * Creates a button view.
     *
     * @private
     * @param {String} label The button label.
     * @param {String} icon The button icon.
     * @param {String} className The additional button CSS class name.
     * @param {String} [eventName] An event name that the `ButtonView#execute` event will be delegated to.
     * @returns {module:ui/button/buttonview~ButtonView} The button view instance.
     */
    _createButton( label, eventName ) {
        const button = new ButtonView( this.locale );
        button.set( {
            label,
            withText: true,
            tooltip: false
        } );
        if ( eventName ) {
            button.delegate( 'execute' ).to( this, eventName );
        }
        return button;
    }

    _setUpDropdown( dropdown, findField, replaceField ) {
        const editor = this.editor;
        const t = editor.t;
        const button = dropdown.buttonView;

        addToolbarToDropdown( dropdown, [findField] );
        addToolbarToDropdown( dropdown, [replaceField] );

        const keystrokes = new KeystrokeHandler();
        keystrokes.listenTo( findField.fieldView.element );
        const findItems = data => {
            this._find( findField, 1 );
            data.preventDefault();
        };
        const findItemsBackwards = data => {
            this._find( findField, -1 );
            data.preventDefault();
        };
        keystrokes.set( 'enter', findItems, { priority: 'highest' } );
        keystrokes.set( 'shift+enter', findItemsBackwards, { priority: 'highest' } );

        const keystrokesReplace = new KeystrokeHandler();
        keystrokesReplace.listenTo( replaceField.fieldView.element );
        const replaceItemsBackwards = data => {
            this._replace( findField, replaceField, false, -1 );
            data.preventDefault();
        };
        const replaceItems = data => {
            this._replace( findField, replaceField );
            data.preventDefault();
        };
        const replaceAllItems = data => {
            this._replaceAll( findField, replaceField );
            data.preventDefault();
        };
        keystrokesReplace.set( 'shift+enter', replaceItemsBackwards, { priority: 'highest' } );
        keystrokesReplace.set( 'enter', replaceItems, { priority: 'highest' } );
        keystrokesReplace.set( 'ctrl+enter', replaceAllItems, { priority: 'highest' } );

        this.replaceButton = this._createButton( t( 'Replace' ) );
        this.replaceAllButton = this._createButton( t( 'Replace all' ) );

        this.previousButton = this._createButton( t( 'Previous' ) );
        this.nextButton = this._createButton( t( 'Next' ) );

        this.listenTo( this.nextButton, 'execute', () => this._find( findField, 1 ) );
        this.listenTo( this.previousButton, 'execute', () => this._find( findField, -1 ) );
        this.listenTo( this.replaceButton, 'execute', () => this._replace( findField, replaceField ) );
        this.listenTo( this.replaceAllButton, 'execute', () => this._replaceAll( findField, replaceField ) );

        addToolbarToDropdown( dropdown,
            [this.replaceButton,
                this.replaceAllButton,
                this.previousButton,
                this.nextButton
            ]
        );

        /**
         * Tracks information about DOM focus in the form.
         *
         * @readonly
         * @member {module:utils/focustracker~FocusTracker}
         */
        this.focusTracker = new FocusTracker();

        /**
         * A collection of views that can be focused in the form.
         *
         * @readonly
         * @protected
         * @member {module:ui/viewcollection~ViewCollection}
         */
        this._focusables = new ViewCollection();

        /**
         * An instance of the {@link module:utils/keystrokehandler~KeystrokeHandler}.
         *
         * @readonly
         * @member {module:utils/keystrokehandler~KeystrokeHandler}
         */
        this.keystrokes = new KeystrokeHandler();

        /**
         * Helps cycling over {@link #_focusables} in the form.
         *
         * @readonly
         * @protected
         * @member {module:ui/focuscycler~FocusCycler}
         */
        this._focusCycler = new FocusCycler( {
            focusables: this._focusables,
            focusTracker: this.focusTracker,
            keystrokeHandler: this.keystrokes,
            actions: {
                // Navigate form fields backwards using the Shift + Tab keystroke.
                focusPrevious: 'shift + tab',
                // Navigate form fields forwards using the Tab key.
                focusNext: 'tab'
            }
        } );

        this._addTabSupport( findField );
        this._addTabSupport( replaceField );
        this._addTabSupport( this.replaceButton );
        this._addTabSupport( this.replaceAllButton );
        this._addTabSupport( this.previousButton );
        this._addTabSupport( this.nextButton );

        button.set( {
            label: t( 'Find and replace' ),
            icon: searchIcon,
            tooltip: true,
            keystroke: 'Ctrl+F'
        } );

        editor.keystrokes.set( 'Ctrl+F', ( keyEvtData, cancel ) => {
            button.set( 'isOn', true );
            dropdown.set( 'isOpen', true );
            findField.focus();
            cancel();
        } );

        // Note: Use the low priority to make sure the following listener starts working after the
        // default action of the drop-down is executed (i.e. the panel showed up). Otherwise, the
        // invisible form/input cannot be focused/selected.
        button.on( 'open', () => {
            findField.focus();
        }, { priority: 'low' } );

        // prevents the dropdown of closing on execute, since the user might want to keep searching or replacing text
        dropdown.off( 'execute' );

        // remove search markers when the search bar is closed
        dropdown.on( 'change:isOpen', () => {
            if ( !dropdown.isOpen ) {
                this._resetStatus();
                editor.editing.view.focus();
            }
        } );

        dropdown.on( 'cancel', () => closeUI() );

        function closeUI() {
            editor.editing.view.focus();
            dropdown.isOpen = false;
        }
    }

    _addTabSupport( object ) {
        // Register the view as focusable.
        this._focusables.add( object );
        // Register the view in the focus tracker.
        this.focusTracker.add( object.element );
        this.keystrokes.listenTo( object.element );
    }

    _find( findField, increment ) {
        const findText = findField.fieldView.element.value;
        const { currentMarker, currentIndex, total } = this.editor.execute( 'findReplace', {
            findText,
            increment
        } );
        this._updateFindInfo( findField, currentIndex, total );
        return currentMarker;
    }

    _resetStatus() {
        this.findInput.infoText = undefined;
        this.replaceInput.infoText = undefined;
        removeSearchMarkers( this.editor.model );
    }

    _replace( findField, replaceField, replaceAll = false, increment = 0 ) {
        const findText = findField.fieldView.element.value;
        const replaceText = replaceField.fieldView.element.value;
        const { currentIndex, total } = this.editor.execute( 'findReplace', {
            findText,
            replaceText,
            replaceAll,
            increment
        } );
        this._updateFindInfo( findField, currentIndex, total, replaceAll );
        return { currentIndex, total };
    }

    _replaceAll( findField, replaceField ) {
        const { total } = this._replace( findField, replaceField, true );
        this._updateReplaceAllInfo( replaceField, total );
    }

    _updateReplaceAllInfo( replaceField, total = 0 ) {
        if ( total > 0 ) {
            const t = this.editor.t;
            replaceField.infoText = t( 'Replaced ' ) + total + t( ' times' );
            this.findInput.infoText = undefined;
        }
    }

    _updateFindInfo( findField, currentIndex = 0, total = 0, replaceAll = false ) {
        this.replaceInput.infoText = undefined;
        const t = this.editor.t;
        if ( !replaceAll && total > 0 ) {
            findField.infoText = currentIndex + 1 + t( ' of ' ) + total;
        } else {
            findField.infoText = t( 'Not found' );
        }
    }
}
