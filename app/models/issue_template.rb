# frozen_string_literal: true

class IssueTemplate < ApplicationRecord
  belongs_to :project
  belongs_to :tracker
  belongs_to :priority, class_name: 'IssuePriority', optional: true

  validates :name, :subject, presence: true
  validates :name, length: { maximum: 60 }
  validates :subject, length: { maximum: 255 }
end
