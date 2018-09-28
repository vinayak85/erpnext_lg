
erpnext.SerialNoBatchSelector = Class.extend({
	init: function(opts) {
		$.extend(this, opts);
		// frm, item, warehouse_details, has_batch, oldest
		let d = this.item;

		// Don't show dialog if batch no or serial no already set
		if(d && d.has_batch_no && !d.batch_no) {
			this.has_batch = 1;
			this.setup();
		} else if(d && d.has_serial_no && !d.serial_no) {
			this.has_batch = 0;
			this.setup();
		}
	},

	setup: function() {
		this.item_code = this.item.item_code;
		this.qty = this.item.qty;
		this.make_dialog();
	},

	make_dialog: function() {
		var me = this;

		this.data = this.oldest ? this.oldest : [];
		let title = "";
		let fields = [
			{
				fieldname: 'item_code',
				read_only: 1,
				fieldtype:'Link',
				options: 'Item',
				label: __('Item Code'),
				default: me.item_code
			},
			{fieldtype:'Column Break'},
			{
				fieldname: 'warehouse',
				fieldtype:'Link',
				options: 'Warehouse',
				label: __(me.warehouse_details.type),
				default: me.warehouse_details.name,
				onchange: function(e) {
					me.warehouse_details.name = this.get_value();
					var batches = this.layout.fields_dict.batches;
					if(batches) {
						batches.grid.df.data = [];
						batches.grid.refresh();
						batches.grid.add_new_row(null, null, null);
					}
				}
			},
			{fieldtype:'Column Break'},
			{
				fieldname: 'qty',
				fieldtype:'Float',
				read_only: 1,
				label: __(me.has_batch ? 'Total Qty' : 'Qty'),
				default: me.qty
			},
		];

		if(this.has_batch) {
			title = __("Select Batch Numbers");
			fields = fields.concat(this.get_batch_fields());
		} else {
			title = __("Select Serial Numbers");
			fields = fields.concat(this.get_serial_no_fields());
		}

		this.dialog = new frappe.ui.Dialog({
			title: title,
			fields: fields
		});

		this.bind_qty();

		this.dialog.set_primary_action(__('Insert'), function() {
			me.values = me.dialog.get_values();
			if(me.validate()) {
				me.set_items();
				me.dialog.hide();
			}
		});

		this.dialog.show();
	},

	validate: function() {
		let values = this.values;
		if(!values.warehouse) {
			frappe.throw(__("Please select a warehouse"));
			return false;
		}
		if(this.has_batch) {
			if(values.batches.length === 0 || !values.batches) {
				frappe.throw(__("Please select batches for batched item "
					+ values.item_code));
				return false;
			}
			values.batches.map((batch, i) => {
				if(!batch.selected_qty || batch.selected_qty === 0 ) {
					frappe.throw(__("Please select quantity on row " + (i+1)));
					return false;
				}
			});
			return true;

		} else {
			let serial_nos = values.serial_no || '';
			if (!serial_nos || !serial_nos.replace(/\s/g, '').length) {
				frappe.throw(__("Please enter serial numbers for serialized item "
					+ values.item_code));
				return false;
			}
			return true;
		}
	},

	set_items: function() {
		var me = this;
		if(this.has_batch) {
			this.values.batches.map((batch, i) => {
				let item_code_field = {};
				let row = (i !== 0) ? this.frm.add_child("items", this.item) : this.item;
				this.map_row_values(row, batch, 'batch_no',
					'selected_qty', this.values.warehouse);
			});
		} else {
			this.map_row_values(this.item, this.values, 'serial_no', 'qty');
		}
		refresh_field("items");
	},

	map_row_values: function(row, values, number, qty_field, warehouse) {
		row.qty = values[qty_field];
		row[number] = values[number];
		if(this.warehouse_details.type === 'Source Warehouse') {
			row.s_warehouse = values.warehouse || warehouse;
		} else if(this.warehouse_details.type === 'Target Warehouse') {
			row.t_warehouse = values.warehouse || warehouse;
		} else {
			row.warehouse = values.warehouse || warehouse;
		}
	},

	bind_qty: function() {
		let serial_no_link = this.dialog.fields_dict.serial_no_select;
		let serial_no_list_field = this.dialog.fields_dict.serial_no;
		let batches_field = this.dialog.fields_dict.batches;

		let qty_field = this.dialog.fields_dict.qty;

		let update_quantity = (batch) => {
			if(batch) {
				let total_qty = 0;
				batches_field.grid.wrapper.find(
					'input[data-fieldname="selected_qty"]').each(function() {

					total_qty += Number($(this).val());
				});
				qty_field.set_input(total_qty);
			} else {
				let serial_numbers = serial_no_list_field.get_value()
					.replace(/\n/g, ' ').match(/\S+/g) || [];
				qty_field.set_input(serial_numbers.length);
			}
		};

		if(serial_no_link) {
			let serial_list = [];
			serial_no_link.$input.on('awesomplete-selectcomplete', function() {
				if(serial_no_link.get_value().length > 0) {
					let new_no = serial_no_link.get_value();
					let list_value = serial_no_list_field.get_value();
					let new_line = '\n';
					if(!serial_no_list_field.get_value()) {
						new_line = '';
					} else {
						serial_list = list_value.replace(/\s+/g, ' ').split(' ');
					}
					if(!serial_list.includes(new_no)) {
						serial_no_link.set_new_description('');
						serial_no_list_field.set_value(list_value + new_line + new_no);
						update_quantity(0);
					} else {
						serial_no_link.set_new_description(new_no + ' is already selected.');
					}
				}

				// Should, but doesn't work
				serial_no_link.set_input('');
				serial_no_link.$input.blur();
			});

			serial_no_list_field.$input.on('input', function() {
				serial_list = serial_no_list_field.get_value().replace(/\s+/g, ' ').split(' ');
				update_quantity(0);
			});
		}

		if(batches_field) {
			batches_field.grid.wrapper.on('change', function() {
				update_quantity(1);
			});
		}
	},

	get_batch_fields: function() {
		var me = this;
		return [
			{fieldtype:'Section Break', label: __('Batches')},
			{fieldname: 'batches', fieldtype: 'Table',
				fields: [
					{
						fieldtype:'Link',
						fieldname:'batch_no',
						options: 'Batch',
						label: __('Select Batch'),
						in_list_view:1,
						get_query: function() {
							return {filters: {item: me.item_code }};
						},
						onchange: function(e) {
							let val = this.get_value();
							if(val.length === 0) {
								this.grid_row.on_grid_fields_dict
									.available_qty.set_value(0);
								return;
							}
							let selected_batches = this.grid.grid_rows.map((row) => {
								if(row === this.grid_row) {
									return "";
								}
								return row.on_grid_fields_dict.batch_no.get_value();
							});
							if(selected_batches.includes(val)) {
								this.set_value("");
								frappe.throw(__(`Batch ${val} already selected.`));
								return;
							}
							if(me.warehouse_details.name) {
								frappe.call({
									method: 'erpnext.stock.doctype.batch.batch.get_batch_qty',
									args: {
										batch_no: this.doc.batch_no,
										warehouse: me.warehouse_details.name,
										item_code: me.item_code
									},
									callback: (r) => {
										this.grid_row.on_grid_fields_dict
											.available_qty.set_value(r.message || 0);
									}
								});

							} else {
								this.set_value("");
								frappe.throw(__(`Please select a warehouse to get available
									quantities`));
							}
							// e.stopImmediatePropagation();
						}
					},
					{
						fieldtype:'Float',
						read_only:1,
						fieldname:'available_qty',
						label: __('Available'),
						in_list_view:1,
						default: 0,
						onchange: function() {
							this.grid_row.on_grid_fields_dict.selected_qty.set_value('0');
						}
					},
					{
						fieldtype:'Float',
						fieldname:'selected_qty',
						label: __('Qty'),
						in_list_view:1,
						'default': 0,
						onchange: function(e) {
							var batch_no = this.grid_row.on_grid_fields_dict.batch_no.get_value();
							var available_qty = this.grid_row.on_grid_fields_dict.available_qty.get_value();
							var selected_qty = this.grid_row.on_grid_fields_dict.selected_qty.get_value();

							if(batch_no.length === 0 && parseInt(selected_qty)!==0) {
								frappe.throw(__("Please select a batch"));
							}
							if(me.warehouse_details.type === 'Source Warehouse' &&
								parseFloat(available_qty) < parseFloat(selected_qty)) {

								this.set_value('0');
								frappe.throw(__(`For transfer from source, selected quantity cannot be
									greater than available quantity`));
							} else {
								this.grid.refresh();
							}
						}
					},
				],
				in_place_edit: true,
				data: this.data,
				get_data: function() {
					return this.data;
				},
			}
		];
	},

	get_serial_no_fields: function() {
		var me = this;
		return [
			{fieldtype: 'Section Break', label: __('Serial No')},
			{
				fieldtype: 'Link', fieldname: 'serial_no_select', options: 'Serial No',
				label: __('Select'),
				get_query: function() {
					return { filters: {item_code: me.item_code}};
				}
			},
			{fieldtype: 'Column Break'},
			{fieldname: 'serial_no', fieldtype: 'Small Text'}
		];
	}
});