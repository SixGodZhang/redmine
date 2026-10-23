class CreateIssueTemplates < ActiveRecord::Migration[8.1]
  def change
    create_table :issue_templates do |t|
      t.integer :project_id, null: false
      t.string :name, null: false
      t.string :subject, null: false
      t.text :description
      t.integer :tracker_id, null: false
      t.integer :priority_id
      t.timestamps
    end
    add_index :issue_templates, :project_id
  end
end
